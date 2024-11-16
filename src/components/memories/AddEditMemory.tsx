import React, { useState, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { format } from 'date-fns';
import { X, Upload, MapPin, Calendar, AlertCircle, Camera } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { collection, addDoc, updateDoc, doc } from 'firebase/firestore';
import { db, storage } from '../../lib/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { toast } from 'sonner';
import type { Memory, Media } from '../../types/memory';
import { mapboxgl } from '../../lib/mapbox';
import { useDeviceType } from '../../hooks/useDeviceType';

const MAX_IMAGES = 25;
const MAX_VIDEOS = 5;
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export function AddEditMemory() {
  const [uploading, setUploading] = useState(false);
  const [location, setLocation] = useState<{ lat: number; lng: number; name: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCamera, setShowCamera] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const { user } = useAuth();
  const { isMobile } = useDeviceType();
  
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    defaultValues: {
      title: '',
      description: '',
      date: format(new Date(), 'yyyy-MM-dd'),
      emotion: 'happy',
    },
  });

  useEffect(() => {
    return () => {
      // Cleanup camera stream when component unmounts
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: 'environment',
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        } 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      streamRef.current = stream;
      setShowCamera(true);
    } catch (error) {
      console.error('Error accessing camera:', error);
      toast.error('Impossible d\'accéder à la caméra');
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    setShowCamera(false);
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d')?.drawImage(video, 0, 0);
      
      canvas.toBlob(async (blob) => {
        if (!blob) {
          toast.error('Erreur lors de la capture');
          return;
        }
        
        const file = new File([blob], `capture-${Date.now()}.jpg`, { type: 'image/jpeg' });
        const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
        if (fileInput) {
          const container = new DataTransfer();
          if (fileInput.files) {
            Array.from(fileInput.files).forEach(f => container.items.add(f));
          }
          container.items.add(file);
          fileInput.files = container.files;
        }
        
        stopCamera();
      }, 'image/jpeg', 0.8);
    }
  };

  const validateFiles = (files: FileList) => {
    const images: File[] = [];
    const videos: File[] = [];
    const errors: string[] = [];

    Array.from(files).forEach(file => {
      if (file.size > MAX_FILE_SIZE) {
        errors.push(`${file.name} dépasse la taille maximale de 50MB`);
        return;
      }

      if (file.type.startsWith('image/')) {
        if (images.length >= MAX_IMAGES) {
          errors.push('Nombre maximum d\'images atteint (25)');
          return;
        }
        images.push(file);
      } else if (file.type.startsWith('video/')) {
        if (videos.length >= MAX_VIDEOS) {
          errors.push('Nombre maximum de vidéos atteint (5)');
          return;
        }
        videos.push(file);
      }
    });

    if (errors.length > 0) {
      toast.error(errors.join('\n'));
      return null;
    }

    return [...images, ...videos];
  };

  const uploadFile = async (file: File): Promise<string> => {
    if (!user) throw new Error('User not authenticated');

    const timestamp = Date.now();
    const fileName = `${timestamp}_${file.name}`;
    const storageRef = ref(storage, `memories/${user.uid}/${fileName}`);

    try {
      const snapshot = await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(snapshot.ref);
      return downloadURL;
    } catch (error) {
      console.error('Error uploading file:', error);
      throw new Error(`Failed to upload ${file.name}`);
    }
  };

  const handleFileUpload = async (files: FileList) => {
    if (!user) return [];
    
    const validFiles = validateFiles(files);
    if (!validFiles) return [];

    setUploading(true);
    const mediaItems: Media[] = [];

    try {
      for (const file of validFiles) {
        const url = await uploadFile(file);
        mediaItems.push({
          id: crypto.randomUUID(),
          url,
          type: file.type.startsWith('image/') ? 'image' : 'video',
          createdAt: new Date().toISOString()
        });
      }
      return mediaItems;
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Erreur lors de l\'upload des fichiers');
      return [];
    } finally {
      setUploading(false);
    }
  };

  const handleLocationSearch = async () => {
    if (!searchQuery.trim()) return;

    try {
      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
          searchQuery
        )}.json?access_token=${mapboxgl.accessToken}&language=fr`
      );
      
      if (!response.ok) {
        throw new Error('Erreur de géocodage');
      }

      const data = await response.json();
      
      if (data.features && data.features.length > 0) {
        const feature = data.features[0];
        const [lng, lat] = feature.center;
        
        setLocation({
          lat,
          lng,
          name: feature.place_name,
        });
        
        toast.success('Lieu trouvé !');
      } else {
        toast.error('Aucun lieu trouvé');
      }
    } catch (error) {
      console.error('Erreur de géocodage:', error);
      toast.error('Impossible de trouver le lieu');
    }
  };

  const onSubmit = async (data: any) => {
    if (!user || !location) {
      toast.error('Veuillez sélectionner un lieu');
      return;
    }

    try {
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      const files = fileInput?.files;
      const newMedia = files?.length ? await handleFileUpload(files) : [];

      const memoryData = {
        title: data.title,
        description: data.description,
        date: data.date,
        location,
        emotion: data.emotion,
        media: newMedia,
        userId: user.uid,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await addDoc(collection(db, 'memories'), memoryData);
      toast.success('Souvenir ajouté !');
      reset();
      window.history.back();
    } catch (error) {
      console.error('Erreur:', error);
      toast.error('Une erreur est survenue');
    }
  };

  return (
    <div className="memory-form-container">
      <div className="memory-form-header">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">Ajouter un souvenir</h2>
          <Button variant="ghost" size="sm" onClick={() => window.history.back()}>
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {showCamera ? (
        <div className="relative">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            className="w-full h-[300px] object-cover"
          />
          <canvas ref={canvasRef} className="hidden" />
          <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-4">
            <Button onClick={capturePhoto}>
              Prendre la photo
            </Button>
            <Button variant="outline" onClick={stopCamera}>
              Annuler
            </Button>
          </div>
        </div>
      ) : (
        <form id="memory-form" onSubmit={handleSubmit(onSubmit)} className="memory-form-content">
          <div className="max-w-2xl mx-auto p-6 space-y-6">
            <Input
              label="Titre"
              {...register('title', { required: 'Titre requis' })}
              error={errors.title?.message}
            />

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
                Description
              </label>
              <textarea
                {...register('description')}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm
                  transition-colors placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2
                  focus-visible:ring-primary-500 dark:border-slate-700 dark:bg-slate-800 dark:placeholder:text-slate-400
                  min-h-[100px] resize-none"
                placeholder="Décrivez votre souvenir..."
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-200 flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Date
                </label>
                <input
                  type="date"
                  {...register('date')}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm
                    transition-colors focus-visible:outline-none focus-visible:ring-2
                    focus-visible:ring-primary-500 dark:border-slate-700 dark:bg-slate-800"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  Émotion
                </label>
                <select
                  {...register('emotion')}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm
                    transition-colors focus-visible:outline-none focus-visible:ring-2
                    focus-visible:ring-primary-500 dark:border-slate-700 dark:bg-slate-800"
                >
                  <option value="happy">😊 Heureux</option>
                  <option value="excited">🎉 Excité</option>
                  <option value="peaceful">😌 Paisible</option>
                  <option value="nostalgic">🥺 Nostalgique</option>
                  <option value="sad">😢 Triste</option>
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-200 flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Lieu
              </label>
              <div className="flex gap-2">
                <Input
                  placeholder="Rechercher un lieu..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1"
                />
                <Button type="button" onClick={handleLocationSearch}>
                  Rechercher
                </Button>
              </div>
              {location && (
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  {location.name}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Upload className="h-4 w-4" />
                  <span>Médias</span>
                </div>
                {isMobile && (
                  <Button
                    type="button"
                    onClick={startCamera}
                    className="flex items-center gap-2"
                  >
                    <Camera className="h-4 w-4" />
                    <span>Prendre une photo</span>
                  </Button>
                )}
              </label>
              <div className="space-y-2">
                <input
                  type="file"
                  multiple
                  accept="image/*,video/*"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm
                    transition-colors file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0
                    file:text-sm file:font-semibold file:bg-primary-50 file:text-primary-700
                    hover:file:bg-primary-100 dark:border-slate-700 dark:bg-slate-800
                    dark:file:bg-primary-900/30 dark:file:text-primary-400"
                />
                <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                  <AlertCircle className="h-4 w-4" />
                  <span>Maximum 25 images et 5 vidéos (50MB max par fichier)</span>
                </div>
              </div>
            </div>
          </div>
        </form>
      )}

      <div className="memory-form-footer">
        <Button variant="outline" onClick={() => window.history.back()}>
          Annuler
        </Button>
        <Button type="submit" form="memory-form" loading={isSubmitting || uploading}>
          Ajouter
        </Button>
      </div>
    </div>
  );
}