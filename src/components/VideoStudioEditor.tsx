import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Film,
  Image as ImageIcon,
  Plus,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Scissors,
  Type,
  Music,
  Trash2,
  Download,
  Upload,
  FolderOpen,
  Save,
  Sparkles,
  CheckCircle2,
  Wand2,
  RotateCw,
  FlipHorizontal,
  Square,
  Circle,
  Undo2,
  Redo2,
  Sliders,
  X,
  FileText,
} from 'lucide-react';
import { executeAutomatedPipeline } from '../utils/dagEngine';

interface VideoStudioEditorProps {
  theme: 'dark' | 'light';
  pendingVideoInstruction?: string | null;
  onConsumePendingInstruction?: () => void;
  onAskCopilot?: (prompt: string) => void;
  onLogActivity?: (action: string) => void;
}

type StudioMode = 'video' | 'photo';
type SidebarPanel = 'library' | 'recipes' | 'automation';
type AspectPreset = '1080x1920' | '1920x1080' | '1080x1080';

interface MediaAsset {
  id: string;
  name: string;
  kind: 'video' | 'audio' | 'image';
  url: string;
  durationSec: number;
  color: string;
}

interface TimelineClip {
  id: string;
  track: 'video' | 'text' | 'audio';
  name: string;
  assetId?: string;
  startSec: number;
  durationSec: number;
  trimStartSec: number;
  textContent?: string;
  textColor?: string;
  fontSize?: number;
  opacity?: number;
  muted?: boolean;
  accentColor: string;
}

interface PhotoLayer {
  id: string;
  type: 'text' | 'rect' | 'circle' | 'image';
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  color: string;
  fontSize?: number;
  imageUrl?: string;
}

interface ReviewedEditPlan {
  projectTitle: string;
  aspectRatio: '9:16' | '16:9' | '1:1';
  trimStartSec: number;
  durationSec: number;
  overlayText: string;
  muteAudio: boolean;
  summary: string;
  engine?: string;
}

interface StudioSnapshot {
  projectName: string;
  aspect: AspectPreset;
  clips: TimelineClip[];
  photoLayers: PhotoLayer[];
}

const DEFAULT_ASSETS: MediaAsset[] = [
  {
    id: 'asset_demo_intro',
    name: 'Studio_Product_Reveal.mp4',
    kind: 'video',
    url: '',
    durationSec: 12,
    color: '#ef4444',
  },
  {
    id: 'asset_demo_broll',
    name: 'Workflow_Timeline_Broll.mp4',
    kind: 'video',
    url: '',
    durationSec: 10,
    color: '#3b82f6',
  },
  {
    id: 'asset_workspace_mp3',
    name: 'AethexFlow_Automation_Brief.mp3',
    kind: 'audio',
    url: '/assets/aistudio/How_AethexFlow_Builds_Lightweight_Secure_Automation__1__aedcb5e0.mp3',
    durationSec: 45,
    color: '#10b981',
  },
];

const INITIAL_CLIPS: TimelineClip[] = [
  {
    id: 'clip_intro_1',
    track: 'video',
    name: 'Studio_Product_Reveal.mp4',
    assetId: 'asset_demo_intro',
    startSec: 0,
    durationSec: 8,
    trimStartSec: 0,
    opacity: 1,
    muted: false,
    accentColor: '#ef4444',
  },
  {
    id: 'clip_text_1',
    track: 'text',
    name: 'Title Overlay',
    startSec: 0.5,
    durationSec: 5,
    trimStartSec: 0,
    textContent: 'AethexFlow Studio · Automated Cut',
    textColor: '#ffffff',
    fontSize: 44,
    opacity: 1,
    accentColor: '#f59e0b',
  },
];

const INITIAL_PHOTO_LAYERS: PhotoLayer[] = [
  {
    id: 'pl_bg_card',
    type: 'rect',
    name: 'Brand Backdrop Card',
    x: 120,
    y: 420,
    width: 840,
    height: 360,
    color: '#181b26',
  },
  {
    id: 'pl_headline',
    type: 'text',
    name: 'Studio Headline',
    x: 540,
    y: 590,
    width: 720,
    height: 120,
    text: 'AethexFlow Media Studio',
    color: '#ffffff',
    fontSize: 54,
  },
];

export const VideoStudioEditor: React.FC<VideoStudioEditorProps> = ({
  theme,
  pendingVideoInstruction,
  onConsumePendingInstruction,
  onAskCopilot,
  onLogActivity,
}) => {
  const isDark = theme === 'dark';

  const [mode, setMode] = useState<StudioMode>('video');
  const [sidebarPanel, setSidebarPanel] = useState<SidebarPanel>('automation');
  const [projectName, setProjectName] = useState<string>('Untitled Project');
  const [aspect, setAspect] = useState<AspectPreset>('1080x1920');
  const [assets, setAssets] = useState<MediaAsset[]>(DEFAULT_ASSETS);
  const [clips, setClips] = useState<TimelineClip[]>(INITIAL_CLIPS);
  const [selectedClipId, setSelectedClipId] = useState<string | null>('clip_intro_1');

  // Photo state
  const [photoLayers, setPhotoLayers] = useState<PhotoLayer[]>(INITIAL_PHOTO_LAYERS);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>('pl_headline');
  const [photoBrightness, setPhotoBrightness] = useState<number>(100);
  const [photoContrast, setPhotoContrast] = useState<number>(100);
  const [photoSaturation, setPhotoSaturation] = useState<number>(100);
  const [photoRotationDeg, setPhotoRotationDeg] = useState<number>(0);
  const [photoFlipX, setPhotoFlipX] = useState<boolean>(false);

  // Undo / Redo stacks
  const [undoStack, setUndoStack] = useState<StudioSnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<StudioSnapshot[]>([]);

  // Transport state
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playheadSec, setPlayheadSec] = useState<number>(0);
  const [zoomPxPerSec, setZoomPxPerSec] = useState<number>(36);

  // Guided workflow state
  const [recipeType, setRecipeType] = useState<string>('shorts');
  const [recipeFormat, setRecipeFormat] = useState<'short' | 'landscape' | 'square'>('short');
  const [recipePrimary, setRecipePrimary] = useState<string>('asset_demo_intro');
  const [recipeTitle, setRecipeTitle] = useState<string>('Launch Cut');
  const [recipeIn, setRecipeIn] = useState<number>(0);
  const [recipeLength, setRecipeLength] = useState<number>(15);
  const [recipeFeedback, setRecipeFeedback] = useState<string>('Select footage and build an editable timeline.');

  // Edit by Instruction state
  const [instructionText, setInstructionText] = useState<string>(
    'Create a 12-second vertical short starting at 2 seconds. Add title: "AethexFlow Launch".'
  );
  const [editSourceId, setEditSourceId] = useState<string>('asset_demo_intro');
  const [isDraftingPlan, setIsDraftingPlan] = useState<boolean>(false);
  const [draftedPlan, setDraftedPlan] = useState<ReviewedEditPlan | null>(null);
  const [assistantFeedback, setAssistantFeedback] = useState<string>(
    'Describe your edit above and click Draft plan to review before applying.'
  );

  // Export modal state
  const [isExportOpen, setIsExportOpen] = useState<boolean>(false);
  const [exportFormat, setExportFormat] = useState<'webm' | 'png' | 'jpeg' | 'webp'>('webm');
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportProgress, setExportProgress] = useState<number>(0);
  const [exportStatusMsg, setExportStatusMsg] = useState<string>('');
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Refs
  const videoCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const photoCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const projectInputRef = useRef<HTMLInputElement | null>(null);
  const srtInputRef = useRef<HTMLInputElement | null>(null);
  const photoLayerInputRef = useRef<HTMLInputElement | null>(null);
  const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const videoCacheRef = useRef<Map<string, HTMLVideoElement>>(new Map());
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [canvasW, canvasH] = aspect.split('x').map(Number);
  const totalDurationSec = Math.max(
    10,
    ...clips.map((c) => c.startSec + c.durationSec)
  );

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2800);
  };

  const pushUndo = useCallback(() => {
    setUndoStack((prev) => [
      ...prev.slice(-19),
      {
        projectName,
        aspect,
        clips: JSON.parse(JSON.stringify(clips)),
        photoLayers: JSON.parse(JSON.stringify(photoLayers)),
      },
    ]);
    setRedoStack([]);
  }, [projectName, aspect, clips, photoLayers]);

  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const last = undoStack[undoStack.length - 1];
    setRedoStack((prev) => [
      ...prev,
      { projectName, aspect, clips, photoLayers },
    ]);
    setUndoStack((prev) => prev.slice(0, -1));
    setProjectName(last.projectName);
    setAspect(last.aspect);
    setClips(last.clips);
    setPhotoLayers(last.photoLayers);
    showToast('Undid last change');
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setUndoStack((prev) => [
      ...prev,
      { projectName, aspect, clips, photoLayers },
    ]);
    setRedoStack((prev) => prev.slice(0, -1));
    setProjectName(next.projectName);
    setAspect(next.aspect);
    setClips(next.clips);
    setPhotoLayers(next.photoLayers);
    showToast('Redid change');
  };

  // Draw current video frame onto canvas
  const renderVideoFrame = useCallback(
    (timeSec: number) => {
      const canvas = videoCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const w = canvas.width;
      const h = canvas.height;

      // Clean studio background gradient
      const bgGrad = ctx.createLinearGradient(0, 0, w, h);
      bgGrad.addColorStop(0, '#0d1018');
      bgGrad.addColorStop(0.55, '#151926');
      bgGrad.addColorStop(1, '#1b1118');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, w, h);

      // Subtle grid accents
      ctx.strokeStyle = 'rgba(255,255,255,0.04)';
      ctx.lineWidth = 2;
      const step = 120;
      for (let gx = 0; gx < w; gx += step) {
        ctx.beginPath();
        ctx.moveTo(gx, 0);
        ctx.lineTo(gx, h);
        ctx.stroke();
      }
      for (let gy = 0; gy < h; gy += step) {
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.lineTo(w, gy);
        ctx.stroke();
      }

      // Active video clip at current playhead
      const activeVideoClips = clips.filter(
        (c) => c.track === 'video' && timeSec >= c.startSec && timeSec <= c.startSec + c.durationSec
      );

      if (activeVideoClips.length === 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.16)';
        ctx.font = '600 32px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Timeline Gap — Move playhead or add media clip', w / 2, h / 2);
      }

      for (const clip of activeVideoClips) {
        const asset = assets.find((a) => a.id === clip.assetId);
        const localT = timeSec - clip.startSec + clip.trimStartSec;
        ctx.save();
        ctx.globalAlpha = clip.opacity ?? 1;

        if (asset?.kind === 'image' && asset.url) {
          let img = imageCacheRef.current.get(asset.url);
          if (!img) {
            img = new Image();
            img.src = asset.url;
            imageCacheRef.current.set(asset.url, img);
          }
          if (img.complete && img.naturalWidth > 0) {
            const scale = Math.min(w / img.naturalWidth, h / img.naturalHeight);
            const dw = img.naturalWidth * scale;
            const dh = img.naturalHeight * scale;
            ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
          }
        } else if (asset?.kind === 'video' && asset.url) {
          let vid = videoCacheRef.current.get(asset.url);
          if (!vid) {
            vid = document.createElement('video');
            vid.src = asset.url;
            vid.muted = true;
            vid.playsInline = true;
            videoCacheRef.current.set(asset.url, vid);
          }
          if (Math.abs(vid.currentTime - localT) > 0.25 && vid.readyState >= 1) {
            vid.currentTime = localT % (vid.duration || 10);
          }
          if (vid.readyState >= 2 && vid.videoWidth > 0) {
            const scale = Math.min(w / vid.videoWidth, h / vid.videoHeight);
            const dw = vid.videoWidth * scale;
            const dh = vid.videoHeight * scale;
            ctx.drawImage(vid, (w - dw) / 2, (h - dh) / 2, dw, dh);
          }
        } else {
          // Animated synthetic motion visual for built-in demo footage
          const pulse = 0.5 + 0.5 * Math.sin(localT * 1.8);
          const orbX = w * (0.28 + 0.44 * (0.5 + 0.5 * Math.cos(localT * 0.9)));
          const orbY = h * (0.35 + 0.2 * Math.sin(localT * 1.1));
          const rad = ctx.createRadialGradient(orbX, orbY, 20, orbX, orbY, Math.min(w, h) * 0.45);
          rad.addColorStop(0, `${clip.accentColor}aa`);
          rad.addColorStop(0.55, `${clip.accentColor}22`);
          rad.addColorStop(1, 'transparent');
          ctx.fillStyle = rad;
          ctx.fillRect(0, 0, w, h);

          // Animated waveform bars
          const barCount = 24;
          const barW = Math.max(8, (w * 0.56) / barCount);
          const startX = (w - barCount * barW) / 2;
          for (let i = 0; i < barCount; i++) {
            const bh = 24 + 90 * (0.5 + 0.5 * Math.sin(localT * 4 + i * 0.55)) * (0.6 + 0.4 * pulse);
            ctx.fillStyle = 'rgba(255,255,255,0.22)';
            ctx.fillRect(startX + i * barW, h * 0.68 - bh / 2, barW * 0.58, bh);
          }

          ctx.fillStyle = 'rgba(255,255,255,0.88)';
          ctx.font = '700 34px Inter, system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(clip.name, w / 2, h * 0.42);
          ctx.fillStyle = 'rgba(255,255,255,0.55)';
          ctx.font = '500 24px monospace';
          ctx.fillText(`Clip TC ${localT.toFixed(2)}s${clip.muted ? ' · MUTED' : ''}`, w / 2, h * 0.47);
        }
        ctx.restore();
      }

      // Active text / caption clips
      const activeTextClips = clips.filter(
        (c) => c.track === 'text' && timeSec >= c.startSec && timeSec <= c.startSec + c.durationSec
      );
      activeTextClips.forEach((tc, idx) => {
        const label = tc.textContent || tc.name;
        const fSize = tc.fontSize || 44;
        ctx.save();
        ctx.font = `800 ${fSize}px Inter, system-ui, sans-serif`;
        const metrics = ctx.measureText(label);
        const padX = 36;
        const boxW = Math.min(w - 80, metrics.width + padX * 2);
        const boxH = fSize + 36;
        const boxX = (w - boxW) / 2;
        const boxY = h * 0.78 - idx * (boxH + 16);

        ctx.fillStyle = 'rgba(10, 11, 15, 0.78)';
        ctx.beginPath();
        ctx.roundRect(boxX, boxY, boxW, boxH, 16);
        ctx.fill();
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.55)';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = tc.textColor || '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, w / 2, boxY + boxH / 2, w - 120);
        ctx.restore();
      });
    },
    [clips, assets]
  );

  // Render photo canvas
  const renderPhotoFrame = useCallback(() => {
    const canvas = photoCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate((photoRotationDeg * Math.PI) / 180);
    ctx.scale(photoFlipX ? -1 : 1, 1);
    ctx.translate(-w / 2, -h / 2);
    ctx.filter = `brightness(${photoBrightness}%) contrast(${photoContrast}%) saturate(${photoSaturation}%)`;

    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#0f121a');
    grad.addColorStop(1, '#1f1419');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    for (const layer of photoLayers) {
      if (layer.type === 'rect') {
        ctx.fillStyle = layer.color;
        ctx.beginPath();
        ctx.roundRect(layer.x, layer.y, layer.width, layer.height, 24);
        ctx.fill();
      } else if (layer.type === 'circle') {
        ctx.fillStyle = layer.color;
        ctx.beginPath();
        ctx.arc(layer.x, layer.y, layer.width / 2, 0, Math.PI * 2);
        ctx.fill();
      } else if (layer.type === 'text') {
        ctx.fillStyle = layer.color;
        ctx.font = `800 ${layer.fontSize || 48}px Inter, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(layer.text || 'Text Layer', layer.x, layer.y, w - 100);
      } else if (layer.type === 'image' && layer.imageUrl) {
        let img = imageCacheRef.current.get(layer.imageUrl);
        if (!img) {
          img = new Image();
          img.src = layer.imageUrl;
          img.onload = () => renderPhotoFrame();
          imageCacheRef.current.set(layer.imageUrl, img);
        }
        if (img.complete && img.naturalWidth > 0) {
          ctx.drawImage(img, layer.x, layer.y, layer.width, layer.height);
        }
      }
    }
    ctx.restore();
  }, [photoLayers, photoBrightness, photoContrast, photoSaturation, photoRotationDeg, photoFlipX]);

  useEffect(() => {
    if (mode === 'video') {
      renderVideoFrame(playheadSec);
    } else {
      renderPhotoFrame();
    }
  }, [mode, playheadSec, aspect, renderVideoFrame, renderPhotoFrame]);

  // Playback ticker
  useEffect(() => {
    if (!isPlaying || mode !== 'video') return;
    let rafId: number;
    let lastTs = performance.now();

    const tick = (now: number) => {
      const dt = (now - lastTs) / 1000;
      lastTs = now;
      setPlayheadSec((prev) => {
        const next = prev + dt;
        if (next >= totalDurationSec) {
          setIsPlaying(false);
          return 0;
        }
        return next;
      });
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, mode, totalDurationSec]);

  // Audio track synchronization during playback
  useEffect(() => {
    const activeAudio = clips.find(
      (c) => c.track === 'audio' && !c.muted && playheadSec >= c.startSec && playheadSec <= c.startSec + c.durationSec
    );
    const asset = activeAudio ? assets.find((a) => a.id === activeAudio.assetId) : null;
    if (isPlaying && asset?.url) {
      if (!audioRef.current || audioRef.current.src !== new URL(asset.url, window.location.href).href) {
        if (audioRef.current) audioRef.current.pause();
        audioRef.current = new Audio(asset.url);
      }
      if (audioRef.current.paused) {
        audioRef.current.play().catch(() => {});
      }
    } else if (audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause();
    }
  }, [isPlaying, playheadSec, clips, assets]);

  // Import local files into Media Library
  const handleImportFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const added: MediaAsset[] = [];
    Array.from(files).forEach((file) => {
      const url = URL.createObjectURL(file);
      const kind: 'video' | 'audio' | 'image' = file.type.startsWith('audio')
        ? 'audio'
        : file.type.startsWith('image')
        ? 'image'
        : 'video';
      added.push({
        id: `asset_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: file.name,
        kind,
        url,
        durationSec: kind === 'image' ? 6 : 15,
        color: kind === 'audio' ? '#10b981' : kind === 'image' ? '#f59e0b' : '#ef4444',
      });
    });

    setAssets((prev) => [...added, ...prev]);
    if (added[0] && added[0].kind !== 'audio') {
      setEditSourceId(added[0].id);
      setRecipePrimary(added[0].id);
    }
    showToast(`Imported ${added.length} local media file(s)`);
    onLogActivity?.(`Imported ${added.length} media file(s) into Video Studio`);
  };

  const addAssetToTimeline = (asset: MediaAsset) => {
    pushUndo();
    const targetTrack: 'video' | 'audio' = asset.kind === 'audio' ? 'audio' : 'video';
    const existingEnd = clips
      .filter((c) => c.track === targetTrack)
      .reduce((max, c) => Math.max(max, c.startSec + c.durationSec), 0);

    const newClip: TimelineClip = {
      id: `clip_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      track: targetTrack,
      name: asset.name,
      assetId: asset.id,
      startSec: existingEnd,
      durationSec: Math.min(20, asset.durationSec),
      trimStartSec: 0,
      opacity: 1,
      muted: false,
      accentColor: asset.color,
    };

    setClips((prev) => [...prev, newClip]);
    setSelectedClipId(newClip.id);
    showToast(`Added "${asset.name}" to ${targetTrack} track`);
  };

  const handleAddTextClip = () => {
    pushUndo();
    const newClip: TimelineClip = {
      id: `clip_txt_${Date.now()}`,
      track: 'text',
      name: 'Caption / Title',
      startSec: Number(playheadSec.toFixed(2)),
      durationSec: 4,
      trimStartSec: 0,
      textContent: 'New Studio Caption',
      textColor: '#ffffff',
      fontSize: 44,
      opacity: 1,
      accentColor: '#f59e0b',
    };
    setClips((prev) => [...prev, newClip]);
    setSelectedClipId(newClip.id);
  };

  const handleAddAudioClip = () => {
    const audioAsset = assets.find((a) => a.kind === 'audio') || assets[0];
    if (!audioAsset) return;
    pushUndo();
    const newClip: TimelineClip = {
      id: `clip_aud_${Date.now()}`,
      track: 'audio',
      name: audioAsset.name,
      assetId: audioAsset.id,
      startSec: 0,
      durationSec: Math.min(25, audioAsset.durationSec),
      trimStartSec: 0,
      muted: false,
      accentColor: '#10b981',
    };
    setClips((prev) => [...prev, newClip]);
    setSelectedClipId(newClip.id);
    showToast(`Added audio track: ${audioAsset.name}`);
  };

  const handleSplitAtPlayhead = () => {
    const target = clips.find(
      (c) =>
        (c.id === selectedClipId || !selectedClipId) &&
        playheadSec > c.startSec + 0.2 &&
        playheadSec < c.startSec + c.durationSec - 0.2
    );
    if (!target) {
      showToast('Move playhead inside a clip to split');
      return;
    }
    pushUndo();
    const splitOffset = playheadSec - target.startSec;
    const firstPart: TimelineClip = {
      ...target,
      durationSec: Number(splitOffset.toFixed(2)),
    };
    const secondPart: TimelineClip = {
      ...target,
      id: `clip_split_${Date.now()}`,
      name: `${target.name} (Part 2)`,
      startSec: Number(playheadSec.toFixed(2)),
      durationSec: Number((target.durationSec - splitOffset).toFixed(2)),
      trimStartSec: Number((target.trimStartSec + splitOffset).toFixed(2)),
    };
    setClips((prev) =>
      prev.flatMap((c) => (c.id === target.id ? [firstPart, secondPart] : [c]))
    );
    setSelectedClipId(secondPart.id);
    showToast(`Split "${target.name}" at ${playheadSec.toFixed(2)}s`);
  };

  const handleDeleteSelectedClip = () => {
    if (!selectedClipId) return;
    pushUndo();
    setClips((prev) => prev.filter((c) => c.id !== selectedClipId));
    setSelectedClipId(null);
    showToast('Removed clip from timeline');
  };

  // SRT captions importer
  const handleImportSrt = async (file: File | undefined) => {
    if (!file) return;
    const text = await file.text();
    const blocks = text.split(/\r?\n\r?\n/);
    const imported: TimelineClip[] = [];
    const parseTc = (tc: string) => {
      const m = tc.trim().match(/(\d+):(\d+):(\d+)[,.](\d+)/);
      if (!m) return 0;
      return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]) / 1000;
    };
    blocks.forEach((blk, idx) => {
      const lines = blk.split(/\r?\n/).filter(Boolean);
      const timeLine = lines.find((l) => l.includes('-->'));
      if (!timeLine) return;
      const [startStr, endStr] = timeLine.split('-->');
      const startSec = parseTc(startStr);
      const endSec = parseTc(endStr);
      const caption = lines.slice(lines.indexOf(timeLine) + 1).join(' ');
      if (caption && endSec > startSec) {
        imported.push({
          id: `srt_${Date.now()}_${idx}`,
          track: 'text',
          name: `SRT #${idx + 1}`,
          startSec,
          durationSec: Number((endSec - startSec).toFixed(2)),
          trimStartSec: 0,
          textContent: caption,
          textColor: '#ffffff',
          fontSize: 40,
          accentColor: '#f59e0b',
        });
      }
    });

    if (imported.length > 0) {
      pushUndo();
      setClips((prev) => [...prev, ...imported]);
      showToast(`Imported ${imported.length} SRT caption cues`);
      onLogActivity?.(`Imported ${imported.length} captions from ${file.name}`);
    }
  };

  // Edit by Instruction: Reusable planner helper + auto-draft from AI Chat
  const requestVideoPlan = useCallback(
    async (instructionToPlan: string) => {
      if (!instructionToPlan.trim()) return;
      setIsDraftingPlan(true);
      setAssistantFeedback('Generating structured edit plan...');
      const sourceAsset = assets.find((a) => a.id === editSourceId) || assets[0];

      try {
        const res = await fetch('/api/video-plan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            instruction: instructionToPlan.trim(),
            sourceName: sourceAsset?.name || 'Footage',
            durationSec: sourceAsset?.durationSec || 20,
          }),
        });
        const data = await res.json();
        setDraftedPlan(data);
        setAssistantFeedback('Plan ready for review. Click "Apply reviewed plan" to commit to timeline.');
      } catch {
        setAssistantFeedback('Could not reach planner endpoint. Try again.');
      } finally {
        setIsDraftingPlan(false);
      }
    },
    [assets, editSourceId]
  );

  useEffect(() => {
    if (pendingVideoInstruction && pendingVideoInstruction.trim()) {
      setMode('video');
      setSidebarPanel('automation');
      setInstructionText(pendingVideoInstruction);
      requestVideoPlan(pendingVideoInstruction);
      showToast('Brief loaded from AI Chat & auto-drafted');
      onConsumePendingInstruction?.();
    }
  }, [pendingVideoInstruction, requestVideoPlan, onConsumePendingInstruction]);

  const handleDraftPlan = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!instructionText.trim() || isDraftingPlan) return;
    await requestVideoPlan(instructionText);
  };

  const handleApplyReviewedPlan = () => {
    if (!draftedPlan) return;
    pushUndo();

    // Automated background DAG pipeline check (silently replaces manual Toolchain Locker)
    const pipeRun = executeAutomatedPipeline(`Video Studio Plan: ${draftedPlan.projectTitle}`);

    const nextAspect: AspectPreset =
      draftedPlan.aspectRatio === '16:9'
        ? '1920x1080'
        : draftedPlan.aspectRatio === '1:1'
        ? '1080x1080'
        : '1080x1920';

    const sourceAsset = assets.find((a) => a.id === editSourceId) || assets[0];
    const nextClips: TimelineClip[] = [
      {
        id: `clip_plan_${Date.now()}`,
        track: 'video',
        name: sourceAsset?.name || 'Planned Clip',
        assetId: sourceAsset?.id,
        startSec: 0,
        durationSec: draftedPlan.durationSec,
        trimStartSec: draftedPlan.trimStartSec,
        opacity: 1,
        muted: draftedPlan.muteAudio,
        accentColor: '#ef4444',
      },
    ];

    if (draftedPlan.overlayText) {
      nextClips.push({
        id: `clip_plan_txt_${Date.now()}`,
        track: 'text',
        name: 'Title Overlay',
        startSec: 0.4,
        durationSec: Math.min(draftedPlan.durationSec, 6),
        trimStartSec: 0,
        textContent: draftedPlan.overlayText,
        textColor: '#ffffff',
        fontSize: 46,
        opacity: 1,
        accentColor: '#f59e0b',
      });
    }

    setProjectName(draftedPlan.projectTitle);
    setAspect(nextAspect);
    setClips(nextClips);
    setSelectedClipId(nextClips[0].id);
    setPlayheadSec(0);
    setMode('video');
    showToast(`Applied reviewed plan (${pipeRun.stepsExecuted.length}-step pipeline verified)`);
    onLogActivity?.(`Applied Video Studio plan: "${draftedPlan.projectTitle}" (${draftedPlan.aspectRatio})`);
  };

  // Guided Workflows Builder
  const handleApplyRecipe = () => {
    pushUndo();
    const pipeRun = executeAutomatedPipeline(`Guided Recipe: ${recipeType}`);
    const nextAspect: AspectPreset =
      recipeFormat === 'landscape'
        ? '1920x1080'
        : recipeFormat === 'square'
        ? '1080x1080'
        : '1080x1920';
    const primary = assets.find((a) => a.id === recipePrimary) || assets[0];
    const newClips: TimelineClip[] = [
      {
        id: `clip_rec_${Date.now()}`,
        track: 'video',
        name: primary?.name || 'Primary Footage',
        assetId: primary?.id,
        startSec: 0,
        durationSec: Math.max(2, recipeLength),
        trimStartSec: Math.max(0, recipeIn),
        opacity: 1,
        muted: false,
        accentColor: '#ef4444',
      },
    ];

    if (recipeTitle.trim()) {
      newClips.push({
        id: `clip_rec_txt_${Date.now()}`,
        track: 'text',
        name: 'Workflow Title',
        startSec: 0.3,
        durationSec: Math.min(recipeLength, 5),
        trimStartSec: 0,
        textContent: recipeTitle.trim(),
        textColor: '#ffffff',
        fontSize: 46,
        accentColor: '#f59e0b',
      });
    }

    setAspect(nextAspect);
    setProjectName(recipeTitle.trim() || `${recipeType.toUpperCase()} Timeline`);
    setClips(newClips);
    setSelectedClipId(newClips[0].id);
    setMode('video');
    setRecipeFeedback(`Timeline built (${pipeRun.totalLatencyMs}ms automated DAG verification).`);
    showToast('Editable timeline created');
    onLogActivity?.(`Built Guided Workflow timeline (${recipeFormat})`);
  };

  const handlePreflightCheck = () => {
    const issues: string[] = [];
    if (clips.filter((c) => c.track === 'video').length === 0) {
      issues.push('No video/image clips on sequence');
    }
    if (!projectName.trim()) {
      issues.push('Project title is blank');
    }
    setRecipeFeedback(
      issues.length === 0
        ? `Preflight passed: ${clips.length} track items ready for ${aspect} export.`
        : `Preflight warnings: ${issues.join('; ')}`
    );
  };

  // Save / Open Project JSON
  const handleSaveProject = () => {
    const payload = {
      version: '4.2.0',
      projectName,
      aspect,
      clips,
      photoLayers,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectName.toLowerCase().replace(/\s+/g, '_')}.aethexproj.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Saved project JSON locally');
  };

  const handleOpenProject = async (file: File | undefined) => {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      pushUndo();
      if (parsed.projectName) setProjectName(parsed.projectName);
      if (parsed.aspect) setAspect(parsed.aspect);
      if (Array.isArray(parsed.clips)) setClips(parsed.clips);
      if (Array.isArray(parsed.photoLayers)) setPhotoLayers(parsed.photoLayers);
      showToast(`Opened project "${parsed.projectName || file.name}"`);
    } catch {
      showToast('Invalid project JSON file');
    }
  };

  // Real Canvas Export (WebM via MediaRecorder or PNG/JPEG/WebP image export)
  const handleStartExport = async () => {
    setIsExporting(true);
    setExportProgress(10);
    setExportStatusMsg('Preparing renderer...');

    if (mode === 'photo' || exportFormat === 'png' || exportFormat === 'jpeg' || exportFormat === 'webp') {
      const canvas = mode === 'photo' ? photoCanvasRef.current : videoCanvasRef.current;
      if (!canvas) {
        setIsExporting(false);
        return;
      }
      const mime =
        exportFormat === 'jpeg'
          ? 'image/jpeg'
          : exportFormat === 'webp'
          ? 'image/webp'
          : 'image/png';
      canvas.toBlob(
        (blob) => {
          if (blob) {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${projectName.toLowerCase().replace(/\s+/g, '_')}.${exportFormat === 'webm' ? 'png' : exportFormat}`;
            a.click();
            URL.revokeObjectURL(url);
            setExportProgress(100);
            setExportStatusMsg(`Exported ${mime} frame successfully.`);
            onLogActivity?.(`Exported ${exportFormat.toUpperCase()} from Studio`);
          }
          setIsExporting(false);
        },
        mime,
        0.92
      );
      return;
    }

    // Real WebM video capture via Canvas captureStream + MediaRecorder
    const canvas = videoCanvasRef.current;
    if (!canvas || typeof MediaRecorder === 'undefined') {
      setIsExporting(false);
      setExportStatusMsg('MediaRecorder is unavailable in this browser environment.');
      return;
    }

    try {
      const stream = canvas.captureStream(30);
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm';
      const recorder = new MediaRecorder(stream, { mimeType });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunks.push(ev.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${projectName.toLowerCase().replace(/\s+/g, '_')}.webm`;
        a.click();
        URL.revokeObjectURL(url);
        setIsExporting(false);
        setExportProgress(100);
        setExportStatusMsg(`Exported WebM video (${(blob.size / 1024).toFixed(1)} KB).`);
        onLogActivity?.(`Exported WebM video "${projectName}" (${(blob.size / 1024).toFixed(1)} KB)`);
      };

      const renderDur = Math.min(4, totalDurationSec);
      const fps = 24;
      const totalFrames = Math.max(24, Math.round(renderDur * fps));
      recorder.start();

      for (let i = 0; i < totalFrames; i++) {
        renderVideoFrame((i / fps) % totalDurationSec);
        setExportProgress(Math.round(((i + 1) / totalFrames) * 95));
        setExportStatusMsg(`Encoding frame ${i + 1}/${totalFrames}...`);
        await new Promise((r) => setTimeout(r, 1000 / fps));
      }
      recorder.stop();
    } catch {
      setIsExporting(false);
      setExportStatusMsg('Video capture interrupted. Try PNG export fallback.');
    }
  };

  const selectedClip = clips.find((c) => c.id === selectedClipId) || null;
  const selectedLayer = photoLayers.find((l) => l.id === selectedLayerId) || null;

  const formatTimecode = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `${String(mins).padStart(2, '0')}:${secs < 10 ? '0' : ''}${secs.toFixed(2)}`;
  };

  return (
    <div className="space-y-4 max-w-[1440px] mx-auto animate-in fade-in duration-300">
      {/* Studio Top Bar */}
      <div
        className={`p-3 sm:px-5 rounded-2xl border backdrop-blur-xl flex flex-wrap items-center justify-between gap-3 shadow-lg ${
          isDark
            ? 'bg-[#12141c]/75 border-neutral-800/80 shadow-black/40'
            : 'bg-white/85 border-neutral-200/80 shadow-neutral-200/50'
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-red-600/15 border border-red-500/30 text-red-500 flex items-center justify-center">
            <Film className="w-4 h-4" />
          </div>
          <div>
            <h1 className={`font-bold text-sm sm:text-base ${isDark ? 'text-white' : 'text-neutral-900'}`}>
              Automated Video &amp; Photo Studio
            </h1>
            <p className="text-[11px] text-neutral-400">
              {projectName} · {canvasW} × {canvasH} · Local Canvas Engine
            </p>
          </div>
        </div>

        {/* Mode Switch */}
        <div
          className={`flex items-center p-1 rounded-xl border ${
            isDark ? 'bg-[#0a0b0f] border-neutral-800' : 'bg-neutral-100 border-neutral-200'
          }`}
          role="group"
          aria-label="Studio mode"
        >
          <button
            type="button"
            onClick={() => setMode('video')}
            aria-pressed={mode === 'video'}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 flex items-center gap-1.5 transition-all ${
              mode === 'video'
                ? 'bg-red-600 text-white shadow-sm'
                : isDark
                ? 'text-neutral-400 hover:text-white'
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <Film className="w-3.5 h-3.5" />
            <span>Video Editor</span>
          </button>
          <button
            type="button"
            onClick={() => setMode('photo')}
            aria-pressed={mode === 'photo'}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 flex items-center gap-1.5 transition-all ${
              mode === 'photo'
                ? 'bg-red-600 text-white shadow-sm'
                : isDark
                ? 'text-neutral-400 hover:text-white'
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <ImageIcon className="w-3.5 h-3.5" />
            <span>Photo Editor</span>
          </button>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleUndo}
            disabled={undoStack.length === 0}
            title="Undo"
            className={`p-2 rounded-xl border text-xs disabled:opacity-35 ${
              isDark ? 'border-neutral-800 bg-neutral-900/60 text-neutral-300' : 'border-neutral-200 bg-neutral-50 text-neutral-700'
            }`}
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleRedo}
            disabled={redoStack.length === 0}
            title="Redo"
            className={`p-2 rounded-xl border text-xs disabled:opacity-35 ${
              isDark ? 'border-neutral-800 bg-neutral-900/60 text-neutral-300' : 'border-neutral-200 bg-neutral-50 text-neutral-700'
            }`}
          >
            <Redo2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleSaveProject}
            className={`px-3 py-1.5 rounded-xl border text-xs font-semibold whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
              isDark ? 'border-neutral-800 bg-neutral-900/60 hover:bg-neutral-800 text-neutral-200' : 'border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-800'
            }`}
          >
            <Save className="w-3.5 h-3.5" />
            <span>Project</span>
          </button>
          <button
            type="button"
            onClick={() => projectInputRef.current?.click()}
            className={`px-3 py-1.5 rounded-xl border text-xs font-semibold whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
              isDark ? 'border-neutral-800 bg-neutral-900/60 hover:bg-neutral-800 text-neutral-200' : 'border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-800'
            }`}
          >
            <FolderOpen className="w-3.5 h-3.5" />
            <span>Open</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setExportFormat(mode === 'photo' ? 'png' : 'webm');
              setExportProgress(0);
              setExportStatusMsg('');
              setIsExportOpen(true);
            }}
            className="px-4 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold whitespace-nowrap shrink-0 flex items-center gap-1.5 shadow-sm"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export</span>
          </button>
        </div>
      </div>

      {/* Main 3-column Studio Workspace */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        {/* Left Panel: Library / Guided Workflows / Edit by Instruction */}
        <div
          className={`xl:col-span-3 rounded-2xl border p-4 space-y-4 flex flex-col ${
            isDark ? 'bg-[#12141c] border-neutral-800' : 'bg-white border-neutral-200 shadow-sm'
          }`}
        >
          <div className="grid grid-cols-3 gap-1.5">
            <button
              type="button"
              onClick={() => setSidebarPanel('automation')}
              className={`px-2 py-2 rounded-xl text-[11px] font-semibold whitespace-nowrap flex items-center justify-center gap-1 ${
                sidebarPanel === 'automation'
                  ? 'bg-red-600/15 text-red-400 border border-red-500/30'
                  : 'text-neutral-400 hover:bg-neutral-800/40'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 shrink-0" />
              <span>AI Plan</span>
            </button>
            <button
              type="button"
              onClick={() => setSidebarPanel('library')}
              className={`px-2 py-2 rounded-xl text-[11px] font-semibold whitespace-nowrap flex items-center justify-center gap-1 ${
                sidebarPanel === 'library'
                  ? 'bg-red-600/15 text-red-400 border border-red-500/30'
                  : 'text-neutral-400 hover:bg-neutral-800/40'
              }`}
            >
              <Upload className="w-3.5 h-3.5 shrink-0" />
              <span>Media</span>
            </button>
            <button
              type="button"
              onClick={() => setSidebarPanel('recipes')}
              className={`px-2 py-2 rounded-xl text-[11px] font-semibold whitespace-nowrap flex items-center justify-center gap-1 ${
                sidebarPanel === 'recipes'
                  ? 'bg-red-600/15 text-red-400 border border-red-500/30'
                  : 'text-neutral-400 hover:bg-neutral-800/40'
              }`}
            >
              <Wand2 className="w-3.5 h-3.5 shrink-0" />
              <span>Workflows</span>
            </button>
          </div>

          {/* Panel 1: Edit by Instruction */}
          {sidebarPanel === 'automation' && (
            <form onSubmit={handleDraftPlan} className="space-y-3 text-xs flex-1 flex flex-col">
              <div>
                <h2 className={`font-bold text-sm ${isDark ? 'text-white' : 'text-neutral-900'}`}>
                  Edit by instruction
                </h2>
                <p className="text-[11px] text-neutral-400 mt-0.5">
                  Describe a cut, aspect ratio, or title. Preview before applying.
                </p>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold tracking-wider text-neutral-400 block">
                  Edit Brief
                </label>
                <textarea
                  rows={4}
                  value={instructionText}
                  onChange={(e) => setInstructionText(e.target.value)}
                  placeholder='Make a 20-second vertical short starting at 4 seconds. Add title: "Launch".'
                  className={`w-full p-2.5 rounded-xl border text-xs focus:border-red-500 outline-none ${
                    isDark ? 'bg-[#0a0b0f] border-neutral-800 text-white' : 'bg-neutral-50 border-neutral-200 text-neutral-900'
                  }`}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold tracking-wider text-neutral-400 block">
                  Source Footage
                </label>
                <select
                  value={editSourceId}
                  onChange={(e) => setEditSourceId(e.target.value)}
                  className={`w-full p-2 rounded-xl border text-xs outline-none ${
                    isDark ? 'bg-[#0a0b0f] border-neutral-800 text-white' : 'bg-neutral-50 border-neutral-200 text-neutral-900'
                  }`}
                >
                  {assets.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.kind})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {[
                  { label: 'Vertical short', text: 'Create a 15-second vertical short with title: "Studio Cut"' },
                  { label: 'Landscape 16:9', text: 'Create a 20-second landscape YouTube edit' },
                  { label: 'Square 1:1', text: 'Create a 12-second square video and mute audio' },
                ].map((chip) => (
                  <button
                    key={chip.label}
                    type="button"
                    onClick={() => setInstructionText(chip.text)}
                    className={`px-2.5 py-1 rounded-lg border text-[11px] ${
                      isDark
                        ? 'border-neutral-800 bg-neutral-900/60 text-neutral-300 hover:border-neutral-700'
                        : 'border-neutral-200 bg-neutral-50 text-neutral-700 hover:bg-neutral-100'
                    }`}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>

              <button
                type="submit"
                disabled={isDraftingPlan}
                className="w-full py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs transition-all disabled:opacity-50"
              >
                {isDraftingPlan ? 'Drafting Plan...' : 'Draft plan →'}
              </button>

              {draftedPlan && (
                <div className="p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 space-y-1.5 text-[11px]">
                  <div className="flex items-center justify-between font-bold text-emerald-400">
                    <span>Reviewed Plan</span>
                    <span className="font-mono">{draftedPlan.aspectRatio}</span>
                  </div>
                  <p className={isDark ? 'text-neutral-200' : 'text-neutral-800'}>{draftedPlan.summary}</p>
                  <div className="text-neutral-400 flex flex-wrap gap-2 pt-1 font-mono text-[10px]">
                    <span>In: {draftedPlan.trimStartSec}s</span>
                    <span>Len: {draftedPlan.durationSec}s</span>
                    <span>Audio: {draftedPlan.muteAudio ? 'Muted' : 'On'}</span>
                  </div>
                </div>
              )}

              <button
                type="button"
                disabled={!draftedPlan}
                onClick={handleApplyReviewedPlan}
                className={`w-full py-2 rounded-xl border font-semibold text-xs transition-all disabled:opacity-40 ${
                  draftedPlan
                    ? 'border-emerald-500/40 bg-emerald-600 hover:bg-emerald-500 text-white'
                    : isDark
                    ? 'border-neutral-800 bg-neutral-900 text-neutral-500'
                    : 'border-neutral-200 bg-neutral-100 text-neutral-400'
                }`}
              >
                Apply reviewed plan
              </button>

              <p className="text-[11px] text-neutral-400">{assistantFeedback}</p>

              {onAskCopilot && (
                <button
                  type="button"
                  onClick={() =>
                    onAskCopilot(
                      `Suggest caption hooks and pacing improvements for "${projectName}" (${canvasW}x${canvasH}, ${clips.length} clips): ${instructionText}`
                    )
                  }
                  className={`w-full py-2 rounded-xl border text-[11px] font-semibold transition-all ${
                    isDark
                      ? 'border-neutral-800 bg-neutral-900/50 hover:border-red-500/40 text-neutral-300 hover:text-white'
                      : 'border-neutral-200 bg-neutral-50 hover:border-red-300 text-neutral-700 hover:text-neutral-900'
                  }`}
                >
                  Ask AI Copilot for edit ideas →
                </button>
              )}
            </form>
          )}

          {/* Panel 2: Media Library */}
          {sidebarPanel === 'library' && (
            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <h2 className={`font-bold text-sm ${isDark ? 'text-white' : 'text-neutral-900'}`}>
                  Media Library
                </h2>
                <span className="text-[11px] font-mono text-neutral-400">{assets.length} files</span>
              </div>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className={`w-full p-4 rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-1.5 transition-colors ${
                  isDark
                    ? 'border-neutral-700 hover:border-red-500/60 bg-neutral-900/40 text-neutral-300'
                    : 'border-neutral-300 hover:border-red-500 bg-neutral-50 text-neutral-700'
                }`}
              >
                <Plus className="w-5 h-5 text-red-500" />
                <span className="font-bold">Import local media</span>
                <span className="text-[11px] text-neutral-400">Video, audio, or image files</span>
              </button>

              <div className="space-y-2 max-h-[340px] overflow-y-auto">
                {assets.map((asset) => (
                  <div
                    key={asset.id}
                    className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 ${
                      isDark ? 'border-neutral-800 bg-[#0a0b0f]' : 'border-neutral-200 bg-neutral-50'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className={`font-semibold truncate ${isDark ? 'text-neutral-200' : 'text-neutral-800'}`}>
                        {asset.name}
                      </p>
                      <p className="text-[10px] text-neutral-400 uppercase font-mono">
                        {asset.kind} · {asset.durationSec}s
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => addAssetToTimeline(asset)}
                      className="px-2.5 py-1 rounded-lg bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white text-[11px] font-semibold shrink-0 transition-colors"
                    >
                      + Timeline
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Panel 3: Guided Workflows */}
          {sidebarPanel === 'recipes' && (
            <div className="space-y-3 text-xs">
              <h2 className={`font-bold text-sm ${isDark ? 'text-white' : 'text-neutral-900'}`}>
                Guided Workflows
              </h2>

              <label className="block space-y-1">
                <span className="text-[10px] uppercase font-bold text-neutral-400">Workflow Preset</span>
                <select
                  value={recipeType}
                  onChange={(e) => setRecipeType(e.target.value)}
                  className={`w-full p-2 rounded-xl border outline-none ${
                    isDark ? 'bg-[#0a0b0f] border-neutral-800 text-white' : 'bg-neutral-50 border-neutral-200 text-neutral-900'
                  }`}
                >
                  <option value="shorts">Shorts · Social Vertical Cut</option>
                  <option value="youtube">YouTube · Story Timeline</option>
                  <option value="reaction">Split / Reaction Edit</option>
                  <option value="promo">Product Reveal Cut</option>
                </select>
              </label>

              <label className="block space-y-1">
                <span className="text-[10px] uppercase font-bold text-neutral-400">Output Format</span>
                <select
                  value={recipeFormat}
                  onChange={(e) => setRecipeFormat(e.target.value as any)}
                  className={`w-full p-2 rounded-xl border outline-none ${
                    isDark ? 'bg-[#0a0b0f] border-neutral-800 text-white' : 'bg-neutral-50 border-neutral-200 text-neutral-900'
                  }`}
                >
                  <option value="short">Shorts / Reels 9:16</option>
                  <option value="landscape">YouTube 16:9</option>
                  <option value="square">Square 1:1</option>
                </select>
              </label>

              <div className="grid grid-cols-2 gap-2">
                <label className="block space-y-1">
                  <span className="text-[10px] uppercase font-bold text-neutral-400">In (sec)</span>
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    value={recipeIn}
                    onChange={(e) => setRecipeIn(Number(e.target.value))}
                    className={`w-full p-2 rounded-xl border outline-none ${
                      isDark ? 'bg-[#0a0b0f] border-neutral-800 text-white' : 'bg-neutral-50 border-neutral-200 text-neutral-900'
                    }`}
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-[10px] uppercase font-bold text-neutral-400">Length (sec)</span>
                  <input
                    type="number"
                    min={2}
                    step={1}
                    value={recipeLength}
                    onChange={(e) => setRecipeLength(Number(e.target.value))}
                    className={`w-full p-2 rounded-xl border outline-none ${
                      isDark ? 'bg-[#0a0b0f] border-neutral-800 text-white' : 'bg-neutral-50 border-neutral-200 text-neutral-900'
                    }`}
                  />
                </label>
              </div>

              <label className="block space-y-1">
                <span className="text-[10px] uppercase font-bold text-neutral-400">Video Title</span>
                <input
                  type="text"
                  value={recipeTitle}
                  onChange={(e) => setRecipeTitle(e.target.value)}
                  className={`w-full p-2 rounded-xl border outline-none ${
                    isDark ? 'bg-[#0a0b0f] border-neutral-800 text-white' : 'bg-neutral-50 border-neutral-200 text-neutral-900'
                  }`}
                />
              </label>

              <button
                type="button"
                onClick={handleApplyRecipe}
                className="w-full py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold"
              >
                Build editable timeline
              </button>

              <button
                type="button"
                onClick={handlePreflightCheck}
                className={`w-full py-2 rounded-xl border font-semibold ${
                  isDark ? 'border-neutral-800 bg-neutral-900 text-neutral-300' : 'border-neutral-200 bg-neutral-100 text-neutral-700'
                }`}
              >
                ✓ Check project before export
              </button>

              <p className="text-[11px] text-neutral-400">{recipeFeedback}</p>
            </div>
          )}
        </div>

        {/* Center: Preview Canvas + Transport + Multi-track Timeline / Photo Tools */}
        <div className="xl:col-span-6 space-y-4 flex flex-col">
          {/* Canvas Toolbar + Stage */}
          <div
            className={`rounded-2xl border p-4 space-y-3 ${
              isDark ? 'bg-[#12141c] border-neutral-800' : 'bg-white border-neutral-200 shadow-sm'
            }`}
          >
            <div className="flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <input
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  className={`font-bold bg-transparent border-b border-transparent focus:border-red-500 outline-none truncate max-w-[200px] ${
                    isDark ? 'text-white' : 'text-neutral-900'
                  }`}
                />
                <span className="text-neutral-500">/</span>
                <span className="font-mono text-neutral-400">{canvasW} × {canvasH}</span>
              </div>

              <select
                value={aspect}
                onChange={(e) => {
                  pushUndo();
                  setAspect(e.target.value as AspectPreset);
                }}
                aria-label="Canvas aspect ratio"
                className={`px-2.5 py-1 rounded-lg border text-xs outline-none ${
                  isDark ? 'bg-[#0a0b0f] border-neutral-800 text-neutral-200' : 'bg-neutral-50 border-neutral-200 text-neutral-800'
                }`}
              >
                <option value="1080x1920">9:16 Portrait</option>
                <option value="1920x1080">16:9 Landscape</option>
                <option value="1080x1080">1:1 Square</option>
              </select>
            </div>

            {/* Responsive Preview Stage */}
            <div className="rounded-xl bg-[#07080c] border border-neutral-800/80 p-4 flex items-center justify-center min-h-[290px] max-h-[380px]">
              <canvas
                ref={videoCanvasRef}
                width={canvasW}
                height={canvasH}
                className={`max-h-[340px] max-w-full rounded-lg shadow-xl border border-neutral-800 ${
                  mode === 'video' ? 'block' : 'hidden'
                }`}
              />
              <canvas
                ref={photoCanvasRef}
                width={canvasW}
                height={canvasH}
                className={`max-h-[340px] max-w-full rounded-lg shadow-xl border border-neutral-800 ${
                  mode === 'photo' ? 'block' : 'hidden'
                }`}
              />
            </div>

            {/* Transport Controls (Video Mode) */}
            {mode === 'video' && (
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsPlaying(false);
                      setPlayheadSec(0);
                    }}
                    title="Jump to start"
                    className={`p-2 rounded-lg border ${
                      isDark ? 'border-neutral-800 bg-neutral-900 text-neutral-300' : 'border-neutral-200 bg-neutral-50 text-neutral-700'
                    }`}
                  >
                    <SkipBack className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsPlaying((p) => !p)}
                    aria-label={isPlaying ? 'Pause preview' : 'Play preview'}
                    className="w-9 h-9 rounded-xl bg-red-600 hover:bg-red-500 text-white flex items-center justify-center shadow-sm"
                  >
                    {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsPlaying(false);
                      setPlayheadSec(totalDurationSec);
                    }}
                    title="Jump to end"
                    className={`p-2 rounded-lg border ${
                      isDark ? 'border-neutral-800 bg-neutral-900 text-neutral-300' : 'border-neutral-200 bg-neutral-50 text-neutral-700'
                    }`}
                  >
                    <SkipForward className="w-3.5 h-3.5" />
                  </button>
                  <span className="font-mono text-xs text-neutral-400 ml-1">
                    {formatTimecode(playheadSec)} / {formatTimecode(totalDurationSec)}
                  </span>
                </div>

                <div className="flex items-center gap-2 text-xs">
                  <span className="text-neutral-400 hidden sm:inline">Zoom</span>
                  <input
                    type="range"
                    min={18}
                    max={80}
                    value={zoomPxPerSec}
                    onChange={(e) => setZoomPxPerSec(Number(e.target.value))}
                    className="w-20 accent-red-500"
                  />
                  <button
                    type="button"
                    onClick={handleSplitAtPlayhead}
                    className={`px-2.5 py-1.5 rounded-lg border font-semibold whitespace-nowrap flex items-center gap-1 ${
                      isDark ? 'border-neutral-800 bg-neutral-900 text-neutral-200 hover:bg-neutral-800' : 'border-neutral-200 bg-neutral-50 text-neutral-800'
                    }`}
                  >
                    <Scissors className="w-3.5 h-3.5 text-red-400" />
                    <span>Split</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Multi-track Sequence OR Photo Tools */}
          {mode === 'video' ? (
            <div
              className={`rounded-2xl border p-4 space-y-3 ${
                isDark ? 'bg-[#12141c] border-neutral-800' : 'bg-white border-neutral-200 shadow-sm'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-neutral-300' : 'text-neutral-700'}`}>
                  Sequence Timeline
                </span>
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <button
                    type="button"
                    onClick={handleAddTextClip}
                    className={`px-2.5 py-1 rounded-lg border font-semibold whitespace-nowrap flex items-center gap-1 ${
                      isDark ? 'border-neutral-800 bg-neutral-900 text-neutral-200 hover:bg-neutral-800' : 'border-neutral-200 bg-neutral-50 text-neutral-800'
                    }`}
                  >
                    <Type className="w-3.5 h-3.5 text-amber-400" />
                    <span>+ Text</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => srtInputRef.current?.click()}
                    className={`px-2.5 py-1 rounded-lg border font-semibold whitespace-nowrap flex items-center gap-1 ${
                      isDark ? 'border-neutral-800 bg-neutral-900 text-neutral-200 hover:bg-neutral-800' : 'border-neutral-200 bg-neutral-50 text-neutral-800'
                    }`}
                  >
                    <FileText className="w-3.5 h-3.5 text-blue-400" />
                    <span>Captions (SRT)</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleAddAudioClip}
                    className={`px-2.5 py-1 rounded-lg border font-semibold whitespace-nowrap flex items-center gap-1 ${
                      isDark ? 'border-neutral-800 bg-neutral-900 text-neutral-200 hover:bg-neutral-800' : 'border-neutral-200 bg-neutral-50 text-neutral-800'
                    }`}
                  >
                    <Music className="w-3.5 h-3.5 text-emerald-400" />
                    <span>+ Audio</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteSelectedClip}
                    disabled={!selectedClipId}
                    className="px-2.5 py-1 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 font-semibold whitespace-nowrap flex items-center gap-1 disabled:opacity-40"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete</span>
                  </button>
                </div>
              </div>

              {/* Scrubber */}
              <div className="space-y-1">
                <input
                  type="range"
                  min={0}
                  max={totalDurationSec}
                  step={0.05}
                  value={playheadSec}
                  onChange={(e) => setPlayheadSec(Number(e.target.value))}
                  aria-label="Timeline playhead position"
                  className="w-full accent-red-500"
                />
              </div>

              {/* Tracks */}
              <div className="overflow-x-auto pb-2 space-y-2">
                {(['video', 'text', 'audio'] as const).map((trackName) => {
                  const trackClips = clips.filter((c) => c.track === trackName);
                  return (
                    <div
                      key={trackName}
                      className={`relative h-12 rounded-xl border flex items-center px-2 ${
                        isDark ? 'bg-[#0a0b0f] border-neutral-800' : 'bg-neutral-50 border-neutral-200'
                      }`}
                      style={{ minWidth: `${Math.max(540, totalDurationSec * zoomPxPerSec)}px` }}
                    >
                      <span className="text-[10px] font-mono uppercase text-neutral-500 w-14 shrink-0">
                        {trackName}
                      </span>
                      <div className="relative flex-1 h-9">
                        {trackClips.map((clip) => (
                          <button
                            key={clip.id}
                            type="button"
                            onClick={() => setSelectedClipId(clip.id)}
                            style={{
                              left: `${clip.startSec * zoomPxPerSec}px`,
                              width: `${Math.max(44, clip.durationSec * zoomPxPerSec)}px`,
                            }}
                            className={`absolute top-0 h-full px-2 rounded-lg text-[11px] font-semibold truncate text-left border transition-all ${
                              selectedClipId === clip.id
                                ? 'bg-red-600/30 border-red-500 text-white ring-2 ring-red-500/30'
                                : isDark
                                ? 'bg-neutral-800/90 border-neutral-700 text-neutral-200 hover:border-neutral-500'
                                : 'bg-white border-neutral-300 text-neutral-800 shadow-xs'
                            }`}
                          >
                            {clip.textContent || clip.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div
              className={`rounded-2xl border p-4 space-y-3 ${
                isDark ? 'bg-[#12141c] border-neutral-800' : 'bg-white border-neutral-200 shadow-sm'
              }`}
            >
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    pushUndo();
                    const nl: PhotoLayer = {
                      id: `pl_txt_${Date.now()}`,
                      type: 'text',
                      name: 'Text Layer',
                      x: canvasW / 2,
                      y: canvasH / 2,
                      width: 600,
                      height: 100,
                      text: 'Studio Typography',
                      color: '#ffffff',
                      fontSize: 52,
                    };
                    setPhotoLayers((p) => [...p, nl]);
                    setSelectedLayerId(nl.id);
                  }}
                  className="px-3 py-1.5 rounded-lg border border-neutral-800 bg-neutral-900 text-neutral-200 font-semibold flex items-center gap-1"
                >
                  <Type className="w-3.5 h-3.5 text-amber-400" />
                  <span>+ Text</span>
                </button>
                <button
                  type="button"
                  onClick={() => photoLayerInputRef.current?.click()}
                  className="px-3 py-1.5 rounded-lg border border-neutral-800 bg-neutral-900 text-neutral-200 font-semibold flex items-center gap-1"
                >
                  <ImageIcon className="w-3.5 h-3.5 text-blue-400" />
                  <span>+ Image</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    pushUndo();
                    const nl: PhotoLayer = {
                      id: `pl_rect_${Date.now()}`,
                      type: 'rect',
                      name: 'Rectangle',
                      x: canvasW * 0.2,
                      y: canvasH * 0.25,
                      width: canvasW * 0.6,
                      height: 240,
                      color: '#ef4444',
                    };
                    setPhotoLayers((p) => [...p, nl]);
                    setSelectedLayerId(nl.id);
                  }}
                  className="px-3 py-1.5 rounded-lg border border-neutral-800 bg-neutral-900 text-neutral-200 font-semibold flex items-center gap-1"
                >
                  <Square className="w-3.5 h-3.5 text-red-400" />
                  <span>Rectangle</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    pushUndo();
                    const nl: PhotoLayer = {
                      id: `pl_circ_${Date.now()}`,
                      type: 'circle',
                      name: 'Circle Badge',
                      x: canvasW / 2,
                      y: canvasH * 0.3,
                      width: 240,
                      height: 240,
                      color: '#ef4444',
                    };
                    setPhotoLayers((p) => [...p, nl]);
                    setSelectedLayerId(nl.id);
                  }}
                  className="px-3 py-1.5 rounded-lg border border-neutral-800 bg-neutral-900 text-neutral-200 font-semibold flex items-center gap-1"
                >
                  <Circle className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Circle</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPhotoRotationDeg((r) => (r + 90) % 360)}
                  className="px-3 py-1.5 rounded-lg border border-neutral-800 bg-neutral-900 text-neutral-200 font-semibold flex items-center gap-1"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  <span>Rotate</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPhotoFlipX((f) => !f)}
                  className="px-3 py-1.5 rounded-lg border border-neutral-800 bg-neutral-900 text-neutral-200 font-semibold flex items-center gap-1"
                >
                  <FlipHorizontal className="w-3.5 h-3.5" />
                  <span>Flip</span>
                </button>
              </div>

              <div className="space-y-1.5">
                {photoLayers.map((layer) => (
                  <div
                    key={layer.id}
                    onClick={() => setSelectedLayerId(layer.id)}
                    className={`px-3 py-2 rounded-xl border text-xs flex items-center justify-between cursor-pointer ${
                      selectedLayerId === layer.id
                        ? 'border-red-500 bg-red-600/15 text-white'
                        : isDark
                        ? 'border-neutral-800 bg-[#0a0b0f] text-neutral-300'
                        : 'border-neutral-200 bg-neutral-50 text-neutral-800'
                    }`}
                  >
                    <span className="font-semibold">{layer.name}</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        pushUndo();
                        setPhotoLayers((p) => p.filter((x) => x.id !== layer.id));
                      }}
                      className="text-neutral-400 hover:text-red-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Inspector */}
        <div
          className={`xl:col-span-3 rounded-2xl border p-4 space-y-4 text-xs ${
            isDark ? 'bg-[#12141c] border-neutral-800' : 'bg-white border-neutral-200 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between pb-2 border-b border-neutral-800/70">
            <div className="flex items-center gap-2 font-bold text-sm">
              <Sliders className="w-4 h-4 text-red-500" />
              <span className={isDark ? 'text-white' : 'text-neutral-900'}>Properties</span>
            </div>
            <span className="text-[11px] font-mono text-emerald-400">On-device</span>
          </div>

          {mode === 'video' ? (
            selectedClip ? (
              <div className="space-y-3">
                <p className={`font-bold text-sm truncate ${isDark ? 'text-white' : 'text-neutral-900'}`}>
                  {selectedClip.name}
                </p>

                <label className="block space-y-1">
                  <span className="text-[10px] uppercase font-bold text-neutral-400">Start Time (sec)</span>
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    value={selectedClip.startSec}
                    onChange={(e) =>
                      setClips((prev) =>
                        prev.map((c) =>
                          c.id === selectedClip.id ? { ...c, startSec: Math.max(0, Number(e.target.value)) } : c
                        )
                      )
                    }
                    className={`w-full p-2 rounded-xl border outline-none ${
                      isDark ? 'bg-[#0a0b0f] border-neutral-800 text-white' : 'bg-neutral-50 border-neutral-200 text-neutral-900'
                    }`}
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-[10px] uppercase font-bold text-neutral-400">Duration (sec)</span>
                  <input
                    type="number"
                    min={0.5}
                    step={0.5}
                    value={selectedClip.durationSec}
                    onChange={(e) =>
                      setClips((prev) =>
                        prev.map((c) =>
                          c.id === selectedClip.id ? { ...c, durationSec: Math.max(0.5, Number(e.target.value)) } : c
                        )
                      )
                    }
                    className={`w-full p-2 rounded-xl border outline-none ${
                      isDark ? 'bg-[#0a0b0f] border-neutral-800 text-white' : 'bg-neutral-50 border-neutral-200 text-neutral-900'
                    }`}
                  />
                </label>

                {selectedClip.track === 'text' && (
                  <>
                    <label className="block space-y-1">
                      <span className="text-[10px] uppercase font-bold text-neutral-400">Overlay Text</span>
                      <input
                        type="text"
                        value={selectedClip.textContent || ''}
                        onChange={(e) =>
                          setClips((prev) =>
                            prev.map((c) =>
                              c.id === selectedClip.id ? { ...c, textContent: e.target.value } : c
                            )
                          )
                        }
                        className={`w-full p-2 rounded-xl border outline-none ${
                          isDark ? 'bg-[#0a0b0f] border-neutral-800 text-white' : 'bg-neutral-50 border-neutral-200 text-neutral-900'
                        }`}
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-[10px] uppercase font-bold text-neutral-400">Font Size ({selectedClip.fontSize || 44}px)</span>
                      <input
                        type="range"
                        min={20}
                        max={84}
                        value={selectedClip.fontSize || 44}
                        onChange={(e) =>
                          setClips((prev) =>
                            prev.map((c) =>
                              c.id === selectedClip.id ? { ...c, fontSize: Number(e.target.value) } : c
                            )
                          )
                        }
                        className="w-full accent-red-500"
                      />
                    </label>
                  </>
                )}

                <label className="flex items-center gap-2 pt-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(selectedClip.muted)}
                    onChange={(e) =>
                      setClips((prev) =>
                        prev.map((c) =>
                          c.id === selectedClip.id ? { ...c, muted: e.target.checked } : c
                        )
                      )
                    }
                    className="accent-red-500 rounded"
                  />
                  <span className={isDark ? 'text-neutral-300' : 'text-neutral-700'}>Mute clip audio</span>
                </label>
              </div>
            ) : (
              <p className="text-neutral-400">Select a clip in the timeline to adjust trim, start time, or text.</p>
            )
          ) : (
            <div className="space-y-3">
              {selectedLayer && (
                <div className="space-y-2 pb-3 border-b border-neutral-800">
                  <p className="font-bold text-sm">{selectedLayer.name}</p>
                  {selectedLayer.type === 'text' && (
                    <input
                      type="text"
                      value={selectedLayer.text || ''}
                      onChange={(e) =>
                        setPhotoLayers((p) =>
                          p.map((l) => (l.id === selectedLayer.id ? { ...l, text: e.target.value } : l))
                        )
                      }
                      className={`w-full p-2 rounded-xl border outline-none ${
                        isDark ? 'bg-[#0a0b0f] border-neutral-800 text-white' : 'bg-neutral-50 border-neutral-200 text-neutral-900'
                      }`}
                    />
                  )}
                  <label className="block space-y-1">
                    <span className="text-[10px] uppercase font-bold text-neutral-400">Color</span>
                    <input
                      type="color"
                      value={selectedLayer.color}
                      onChange={(e) =>
                        setPhotoLayers((p) =>
                          p.map((l) => (l.id === selectedLayer.id ? { ...l, color: e.target.value } : l))
                        )
                      }
                      className="w-full h-8 rounded cursor-pointer bg-transparent"
                    />
                  </label>
                </div>
              )}

              <label className="block space-y-1">
                <span className="text-[10px] uppercase font-bold text-neutral-400">Brightness ({photoBrightness}%)</span>
                <input
                  type="range"
                  min={50}
                  max={160}
                  value={photoBrightness}
                  onChange={(e) => setPhotoBrightness(Number(e.target.value))}
                  className="w-full accent-red-500"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-[10px] uppercase font-bold text-neutral-400">Contrast ({photoContrast}%)</span>
                <input
                  type="range"
                  min={50}
                  max={160}
                  value={photoContrast}
                  onChange={(e) => setPhotoContrast(Number(e.target.value))}
                  className="w-full accent-red-500"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-[10px] uppercase font-bold text-neutral-400">Saturation ({photoSaturation}%)</span>
                <input
                  type="range"
                  min={0}
                  max={200}
                  value={photoSaturation}
                  onChange={(e) => setPhotoSaturation(Number(e.target.value))}
                  className="w-full accent-red-500"
                />
              </label>
            </div>
          )}
        </div>
      </div>

      {/* Hidden File Inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*,audio/*,image/*"
        multiple
        className="hidden"
        onChange={(e) => handleImportFiles(e.target.files)}
      />
      <input
        ref={projectInputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(e) => handleOpenProject(e.target.files?.[0])}
      />
      <input
        ref={srtInputRef}
        type="file"
        accept=".srt,text/plain"
        className="hidden"
        onChange={(e) => handleImportSrt(e.target.files?.[0])}
      />
      <input
        ref={photoLayerInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          pushUndo();
          const nl: PhotoLayer = {
            id: `pl_img_${Date.now()}`,
            type: 'image',
            name: f.name,
            x: 160,
            y: 260,
            width: Math.min(720, canvasW - 240),
            height: Math.min(720, canvasH - 400),
            color: '#ffffff',
            imageUrl: URL.createObjectURL(f),
          };
          setPhotoLayers((p) => [...p, nl]);
          setSelectedLayerId(nl.id);
        }}
      />

      {/* Export Modal */}
      {isExportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div
            className={`w-full max-w-md rounded-2xl border p-6 space-y-4 ${
              isDark ? 'bg-[#12141c] border-neutral-800 text-white' : 'bg-white border-neutral-200 text-neutral-900'
            }`}
          >
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-base">Export Studio Media</h2>
              <button
                type="button"
                onClick={() => setIsExportOpen(false)}
                className="p-1.5 rounded-lg hover:bg-neutral-800/50 text-neutral-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <label className="block space-y-1.5 text-xs">
              <span className="font-semibold text-neutral-400">Output Format</span>
              <select
                value={exportFormat}
                onChange={(e) => setExportFormat(e.target.value as any)}
                className={`w-full p-2.5 rounded-xl border outline-none ${
                  isDark ? 'bg-[#0a0b0f] border-neutral-800 text-white' : 'bg-neutral-50 border-neutral-200 text-neutral-900'
                }`}
              >
                <option value="webm">WebM · Browser Video Render</option>
                <option value="png">PNG · Lossless Frame / Photo</option>
                <option value="jpeg">JPEG · Compressed Photo</option>
                <option value="webp">WebP · Web Optimized Photo</option>
              </select>
            </label>

            {exportProgress > 0 && (
              <div className="space-y-1.5">
                <div className="w-full h-2 rounded-full bg-neutral-800 overflow-hidden">
                  <div className="h-full bg-red-500 transition-all" style={{ width: `${exportProgress}%` }} />
                </div>
                <p className="text-xs text-neutral-400">{exportStatusMsg}</p>
              </div>
            )}

            <button
              type="button"
              disabled={isExporting}
              onClick={handleStartExport}
              className="w-full py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs disabled:opacity-50"
            >
              {isExporting ? 'Rendering Media...' : 'Start Export'}
            </button>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-semibold shadow-lg flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          <span>{toastMsg}</span>
        </div>
      )}
    </div>
  );
};
