"use client";

import { useState, useCallback } from "react";
import { Upload, X, Loader2, FileIcon, ImageIcon, VideoIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";

type ConversionType = "image" | "video";

const IMAGE_FORMATS = ["png", "jpeg", "webp", "gif", "bmp", "avif"];
const VIDEO_FORMATS = ["mp4", "webm", "ogg", "mov"];

const IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/bmp",
  "image/avif"
];
const VIDEO_MIME_TYPES = [
  "video/mp4",
  "video/webm",
  "video/ogg",
  "video/quicktime"
];

export function FileConverter() {
  const [file, setFile] = useState<File | null>(null);
  const [converting, setConverting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [type, setType] = useState<ConversionType>("image");
  const [format, setFormat] = useState("");
  const [preview, setPreview] = useState<string>("");
  const { toast } = useToast();

  const resetState = () => {
    setFile(null);
    setProgress(0);
    setPreview("");
    setFormat("");
  };

  const detectFileType = (file: File) => {
    if (IMAGE_MIME_TYPES.includes(file.type)) {
      setType("image");
      return "image";
    } else if (VIDEO_MIME_TYPES.includes(file.type)) {
      setType("video");
      return "video";
    }
    return null;
  };

  const createPreview = async (file: File, fileType: "image" | "video") => {
    setLoading(true);
    try {
      if (fileType === "image") {
        const reader = new FileReader();
        reader.onload = (e) => {
          setPreview(e.target?.result as string);
          setLoading(false);
        };
        reader.readAsDataURL(file);
      } else {
        const url = URL.createObjectURL(file);
        setPreview(url);
        setLoading(false);
      }
    } catch (error) {
      console.error("Preview creation failed:", error);
      setLoading(false);
    }
  };

  const handleFileChange = useCallback(async (file: File) => {
    const fileType = detectFileType(file);
    if (!fileType) {
      toast({
        title: "Invalid file type",
        description: "Please upload an image or video file.",
        variant: "destructive",
      });
      return;
    }

    setFile(file);
    setProgress(0);
    await createPreview(file, fileType);
  }, [toast]);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      handleFileChange(droppedFile);
    }
  }, [handleFileChange]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileChange(e.target.files[0]);
    }
  };

  const convertImage = async (file: File, format: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext("2d");
          ctx?.drawImage(img, 0, 0);
          
          // For GIF and AVIF, we need to handle them differently
          if (format === "gif" || format === "avif") {
            canvas.toBlob((blob) => {
              if (blob) {
                const url = URL.createObjectURL(blob);
                resolve(url);
              } else {
                reject(new Error("Failed to convert image"));
              }
            }, `image/${format}`);
          } else {
            resolve(canvas.toDataURL(`image/${format}`));
          }
        };
        img.onerror = reject;
        img.src = e.target?.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const convertVideo = async (file: File, format: string): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const video = document.createElement("video");
        video.src = e.target?.result as string;
        video.onloadedmetadata = () => {
          const canvas = document.createElement("canvas");
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext("2d");
          const stream = canvas.captureStream();
          
          // Set appropriate codec based on format
          const options: MediaRecorderOptions = {
            mimeType: `video/${format}`,
            videoBitsPerSecond: 8000000 // 8Mbps for better quality
          };

          // For MOV format, we'll use MP4 and then rename the extension
          const actualFormat = format === "mov" ? "mp4" : format;
          const mediaRecorder = new MediaRecorder(stream, {
            ...options,
            mimeType: `video/${actualFormat}`
          });
          
          const chunks: Blob[] = [];

          mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
          mediaRecorder.onstop = () => {
            const blob = new Blob(chunks, { 
              type: format === "mov" ? "video/quicktime" : `video/${format}` 
            });
            resolve(blob);
          };

          video.play();
          const drawFrame = () => {
            ctx?.drawImage(video, 0, 0);
            setProgress((prev) => Math.min(prev + 1, 100));
            if (video.currentTime < video.duration) {
              requestAnimationFrame(drawFrame);
            } else {
              mediaRecorder.stop();
              video.pause();
            }
          };

          mediaRecorder.start();
          drawFrame();
        };
        video.onerror = reject;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleConvert = async () => {
    if (!file || !format) return;

    try {
      setConverting(true);
      setProgress(0);

      let result;
      if (type === "image") {
        result = await convertImage(file, format);
        const link = document.createElement("a");
        link.href = result;
        link.download = `converted.${format}`;
        link.click();
        
        // Clean up object URL if created for GIF/AVIF
        if (format === "gif" || format === "avif") {
          URL.revokeObjectURL(result);
        }
      } else {
        result = await convertVideo(file, format);
        const url = URL.createObjectURL(result);
        const link = document.createElement("a");
        link.href = url;
        link.download = `converted.${format}`;
        link.click();
        URL.revokeObjectURL(url);
      }

      setProgress(100);
      toast({
        title: "Conversion complete",
        description: "Your file has been converted successfully!",
      });
    } catch (error) {
      console.error("Conversion failed:", error);
      toast({
        title: "Conversion failed",
        description: "There was an error converting your file.",
        variant: "destructive",
      });
    } finally {
      setConverting(false);
    }
  };

  return (
    <Card className="p-6 max-w-xl mx-auto">
      <div className="space-y-6">
        {!file ? (
          <div
            className="flex items-center justify-center w-full"
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
          >
            <label
              htmlFor="file-upload"
              className="flex flex-col items-center justify-center w-full h-64 border-2 border-dashed rounded-lg cursor-pointer bg-muted/50 hover:bg-muted transition-colors"
            >
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                <Upload className="w-10 h-10 mb-3 text-muted-foreground" />
                <p className="mb-2 text-sm text-muted-foreground">
                  <span className="font-semibold">Click to upload</span> or drag and drop
                </p>
                <p className="text-xs text-muted-foreground">
                  Images (PNG, JPG, WEBP, GIF, BMP, AVIF) or Videos (MP4, WEBM, OGG, MOV)
                </p>
              </div>
              <input
                id="file-upload"
                type="file"
                className="hidden"
                accept="image/*,video/*"
                onChange={handleInputChange}
              />
            </label>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {type === "image" ? (
                  <ImageIcon className="w-5 h-5 text-muted-foreground" />
                ) : (
                  <VideoIcon className="w-5 h-5 text-muted-foreground" />
                )}
                <p className="text-sm font-medium">{file.name}</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={resetState}
                className="text-muted-foreground hover:text-destructive"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center h-48">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="relative aspect-video rounded-lg overflow-hidden bg-muted">
                {type === "image" ? (
                  <img
                    src={preview}
                    alt="Preview"
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <video
                    src={preview}
                    controls
                    className="w-full h-full"
                  />
                )}
              </div>
            )}

            <Select value={format} onValueChange={setFormat}>
              <SelectTrigger>
                <SelectValue placeholder="Select output format" />
              </SelectTrigger>
              <SelectContent>
                {(type === "image" ? IMAGE_FORMATS : VIDEO_FORMATS).map((fmt) => (
                  <SelectItem key={fmt} value={fmt}>
                    {fmt.toUpperCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {progress > 0 && progress < 100 && (
              <Progress value={progress} className="w-full" />
            )}

            <Button
              onClick={handleConvert}
              disabled={converting || !format}
              className="w-full"
            >
              {converting ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Converting...
                </div>
              ) : (
                "Convert"
              )}
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}