import React, { useState, useEffect, useRef } from 'react';
import {
  QrCode,
  Camera,
  Clipboard,
  Wifi,
  Shield,
  RefreshCw,
  Sparkles,
  X,
  AlertCircle,
  CheckCircle2,
  Upload,
} from 'lucide-react';
import jsQR from 'jsqr';

interface PairingViewProps {
  paired: boolean;
  connected: boolean;
  agentId?: string | null;
  activeHost?: string | null;
  error?: string | null;
  onPair: (uri: string) => Promise<boolean>;
  onUnpair: () => Promise<void>;
  onEnterDemo: () => void;
}

export const PairingView: React.FC<PairingViewProps> = ({
  paired,
  connected,
  agentId,
  activeHost,
  error,
  onPair,
  onUnpair,
  onEnterDemo,
}) => {
  const [pairingUri, setPairingUri] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusType, setStatusType] = useState<'info' | 'error' | 'success'>('info');

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scanIntervalRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Stop camera when unmounting
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const stopCamera = () => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsScanning(false);
  };

  const startCamera = async () => {
    setStatusMessage(null);
    try {
      setIsScanning(true);
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });
      } catch (err) {
        console.warn('Ideal camera constraints failed, attempting fallback to basic video:', err);
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
        });
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true');
        videoRef.current.setAttribute('autoplay', 'true');
        videoRef.current.setAttribute('muted', 'true');
        await videoRef.current.play();

        // Start scanning loop (5 scans per second)
        scanIntervalRef.current = window.setInterval(scanFrame, 200);
      }
    } catch (err: any) {
      console.error('Camera access error:', err);
      setStatusType('error');
      if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
        setStatusMessage('Camera permission was denied. Please grant Camera permission in Android Settings or paste the pairing link.');
      } else {
        setStatusMessage(`Camera unavailable (${err?.name || err?.message || 'Error'}). You can paste the link directly.`);
      }
      stopCamera();
    }
  };

  const scanFrame = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    if (video.videoWidth === 0 || video.videoHeight === 0) return;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: 'attemptBoth',
    });

    if (code && code.data) {
      if (code.data.startsWith('phonedeck://pair')) {
        stopCamera();
        setPairingUri(code.data);
        handleConnect(code.data);
      } else {
        setStatusType('error');
        setStatusMessage('QR code found, but not a Phone Deck pairing link.');
      }
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const img = new Image();
    const reader = new FileReader();

    reader.onload = (event) => {
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.drawImage(img, 0, 0);
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imgData.data, imgData.width, imgData.height, {
          inversionAttempts: 'attemptBoth',
        });

        if (code && code.data.startsWith('phonedeck://pair')) {
          setPairingUri(code.data);
          handleConnect(code.data);
        } else {
          setStatusType('error');
          setStatusMessage('No valid Phone Deck QR code detected in image.');
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && text.includes('phonedeck://pair')) {
        setPairingUri(text.trim());
        setStatusType('info');
        setStatusMessage('Pasted link from clipboard.');
      } else {
        setStatusType('error');
        setStatusMessage('Clipboard does not contain a phonedeck://pair link.');
      }
    } catch {
      setStatusType('error');
      setStatusMessage('Clipboard permission denied. Please paste into the field directly.');
    }
  };

  const handleConnect = async (uriToUse?: string) => {
    const targetUri = (uriToUse || pairingUri).trim();
    if (!targetUri) {
      setStatusType('error');
      setStatusMessage('Please scan a QR code or paste a pairing link.');
      return;
    }

    if (!targetUri.startsWith('phonedeck://pair')) {
      setStatusType('error');
      setStatusMessage('Invalid link. Must start with phonedeck://pair?h=...');
      return;
    }

    setIsSubmitting(true);
    setStatusType('info');
    setStatusMessage('Connecting to PC over encrypted TLS with pinned cert...');

    try {
      const success = await onPair(targetUri);
      if (success) {
        setStatusType('success');
        setStatusMessage('Paired successfully! Initializing live dashboard...');
      } else {
        setStatusType('error');
        setStatusMessage('Pairing failed. Make sure PC and phone are on the same Wi-Fi.');
      }
    } catch (err: any) {
      setStatusType('error');
      setStatusMessage(`Pairing error: ${err?.message || err}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // View: Paired but waiting for PC to connect
  if (paired && !connected) {
    return (
      <div className="w-full h-screen relative flex flex-col items-center justify-center p-6 font-sans select-none overflow-hidden">
        {/* Warm Studio Bokeh Background */}
        <img
          src="/glass-bokeh-bg.jpg"
          alt=""
          className="absolute inset-0 w-full h-full object-cover pointer-events-none select-none"
        />
        <div className="absolute inset-0 bg-black/40 backdrop-blur-md pointer-events-none" />

        <div className="max-w-md w-full bg-white/[0.08] backdrop-blur-2xl border border-white/[0.16] rounded-2xl p-6 text-center space-y-6 shadow-[0_16px_40px_rgba(0,0,0,0.4)] relative overflow-hidden z-10">
          {/* Ambient Glow */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-24 bg-[#B07BFF]/20 blur-3xl pointer-events-none rounded-full" />

          {/* Wi-Fi Radar pulsing icon */}
          <div className="relative mx-auto w-16 h-16 flex items-center justify-center">
            <div className="absolute inset-0 rounded-full bg-[#B07BFF]/20 animate-ping opacity-50" />
            <div className="w-12 h-12 rounded-full bg-[#B07BFF]/20 border border-[#B07BFF]/40 flex items-center justify-center text-[#B07BFF]">
              <Wifi className="w-6 h-6 animate-pulse" />
            </div>
          </div>

          <div className="space-y-2">
            <h1 className="text-lg font-bold tracking-wider text-white uppercase font-mono">
              Connecting to PC...
            </h1>
            <p className="text-xs text-zinc-300 leading-relaxed font-sans">
              Searching for <span className="text-white font-semibold">{agentId || 'Phone Deck Agent'}</span> on your local Wi-Fi.
            </p>
            {activeHost && (
              <div className="inline-block px-2.5 py-1 rounded bg-white/[0.06] text-[11px] text-zinc-300 border border-white/[0.1] font-mono">
                Target: {activeHost}
              </div>
            )}
          </div>

          {error && (
            <div className="p-2.5 rounded-lg bg-[#FF3B5C]/15 border border-[#FF3B5C]/30 text-[#FF6680] text-xs flex items-center gap-2 text-left font-mono">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="pt-2 space-y-3">
            <div className="flex items-center justify-center gap-2 text-[11px] text-zinc-400 font-mono">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#B07BFF]" />
              <span>Auto-reconnecting every 3s</span>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                onClick={onUnpair}
                className="py-2.5 px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-xs text-zinc-300 hover:text-white border border-white/[0.1] transition-all cursor-pointer font-medium font-sans"
              >
                Unpair / New PC
              </button>
              <button
                onClick={onEnterDemo}
                className="py-2.5 px-3 rounded-xl bg-[#B07BFF]/20 hover:bg-[#B07BFF]/30 text-xs text-[#D8B4FE] hover:text-white border border-[#B07BFF]/40 transition-all cursor-pointer font-medium flex items-center justify-center gap-1.5 font-sans"
              >
                <Sparkles className="w-3.5 h-3.5 text-[#B07BFF]" />
                <span>Demo Mode</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // View: Unpaired / Setup Flow
  return (
    <div className="w-full h-screen relative flex flex-col items-center justify-center p-4 md:p-8 font-sans select-none overflow-y-auto">
      {/* Warm Studio Bokeh Background */}
      <img
        src="/glass-bokeh-bg.jpg"
        alt=""
        className="absolute inset-0 w-full h-full object-cover pointer-events-none select-none"
      />
      <div className="absolute inset-0 bg-black/40 backdrop-blur-md pointer-events-none" />

      {/* Hidden canvas for QR image decoding */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Camera Fullscreen Modal */}
      {isScanning && (
        <div className="fixed inset-0 z-50 bg-black/95 flex flex-col items-center justify-between p-4">
          <div className="w-full flex items-center justify-between text-white font-mono text-xs z-10">
            <span className="flex items-center gap-1.5">
              <Camera className="w-4 h-4 text-[#B07BFF]" />
              Point at QR Code on PC Screen
            </span>
            <button
              onClick={stopCamera}
              className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="relative w-full max-w-sm aspect-square my-auto flex items-center justify-center overflow-hidden rounded-2xl border-2 border-[#B07BFF]/50 shadow-[0_0_30px_rgba(176,123,255,0.4)]">
            <video
              ref={videoRef}
              className="w-full h-full object-cover"
              autoPlay
              playsInline
              muted
            />
            {/* Viewfinder target box */}
            <div className="absolute inset-8 border-2 border-dashed border-[#B07BFF] rounded-xl pointer-events-none animate-pulse" />
          </div>

          <div className="w-full max-w-sm text-center text-xs font-mono text-zinc-300 space-y-2 z-10 pb-4">
            <p>Ensure the QR code on your PC monitor is fully inside the frame</p>
            <button
              onClick={stopCamera}
              className="px-4 py-2 rounded-lg bg-white/10 text-white text-xs hover:bg-white/20 cursor-pointer"
            >
              Cancel Camera
            </button>
          </div>
        </div>
      )}

      {/* Main Pairing Card */}
      <div className="max-w-lg w-full bg-white/[0.08] backdrop-blur-2xl border border-white/[0.16] rounded-2xl p-6 md:p-8 shadow-[0_16px_40px_rgba(0,0,0,0.4)] relative space-y-6 z-10">
        {/* Glow */}
        <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-64 h-32 bg-[#B07BFF]/20 blur-3xl pointer-events-none rounded-full" />

        {/* Brand Header */}
        <div className="flex items-center justify-between border-b border-white/[0.1] pb-4">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-[#B07BFF] shadow-[0_0_12px_#B07BFF]" />
            <div>
              <h1 className="text-base font-bold tracking-wider text-white font-mono uppercase">
                PHONE DECK <span className="text-[#B07BFF]">DISPLAY</span>
              </h1>
              <p className="text-[11px] text-zinc-300 font-mono">
                Steam-Deck Style Companion Screen
              </p>
            </div>
          </div>

          <button
            onClick={onEnterDemo}
            className="px-2.5 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-[11px] font-mono text-[#D8B4FE] border border-white/[0.1] flex items-center gap-1.5 transition-all cursor-pointer"
            title="Preview dashboard with mock data without connecting to a PC"
          >
            <Sparkles className="w-3 h-3 text-[#B07BFF]" />
            <span>Try Demo</span>
          </button>
        </div>

        {/* Instructions */}
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#B07BFF]/15 text-[#D8B4FE] text-[10px] font-mono font-medium border border-[#B07BFF]/30">
            <Shield className="w-3 h-3 text-[#B07BFF]" />
            LOCAL WI-FI ONLY · ZERO CLOUD · PINNED TLS
          </div>
          <h2 className="text-sm font-semibold text-[#EDEDF2]">
            Connect to your PC Agent
          </h2>
          <p className="text-xs text-[#71717A] leading-relaxed">
            1. Open <span className="text-[#EDEDF2]">Phone Deck Agent</span> on your PC.<br />
            2. Go to the <span className="text-[#7C5CFF]">Pairing & Devices</span> tab to view your pairing QR code.
          </p>
        </div>

        {/* Primary Action: Camera Scanner */}
        <div className="space-y-3">
          <button
            onClick={startCamera}
            className="w-full py-3.5 px-4 rounded-xl bg-[#7C5CFF] hover:bg-[#6C4CEF] text-white text-xs font-semibold tracking-wider font-mono uppercase flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(124,92,255,0.35)] transition-all cursor-pointer active:scale-[0.98]"
          >
            <Camera className="w-4 h-4" />
            <span>Scan QR Code with Camera</span>
          </button>

          <div className="flex items-center justify-center gap-2 text-xs font-mono text-[#71717A]">
            <span className="h-[1px] flex-1 bg-white/[0.08]" />
            <span>OR PASTE LINK</span>
            <span className="h-[1px] flex-1 bg-white/[0.08]" />
          </div>
        </div>

        {/* Secondary: Text Input / Paste */}
        <div className="space-y-2.5 font-mono">
          <div className="relative">
            <input
              type="text"
              value={pairingUri}
              onChange={(e) => setPairingUri(e.target.value)}
              placeholder="phonedeck://pair?h=192.168.1.150&p=8766&t=..."
              className="w-full bg-white/[0.04] border border-white/[0.1] rounded-xl px-3.5 py-2.5 text-xs text-[#EDEDF2] placeholder-[#4B4B55] focus:outline-none focus:border-[#7C5CFF] pr-20"
            />
            <button
              onClick={handlePasteClipboard}
              className="absolute right-1.5 top-1.5 bottom-1.5 px-2.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-[11px] text-[#A1A1AA] hover:text-white flex items-center gap-1 transition-all cursor-pointer"
            >
              <Clipboard className="w-3 h-3" />
              <span>Paste</span>
            </button>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => handleConnect()}
              disabled={isSubmitting || !pairingUri.trim()}
              className="flex-1 py-2.5 px-4 rounded-xl bg-white/[0.08] hover:bg-white/[0.12] disabled:opacity-40 disabled:cursor-not-allowed text-xs font-medium text-white transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#7C5CFF]" />
                  <span>Pairing...</span>
                </>
              ) : (
                <>
                  <QrCode className="w-3.5 h-3.5 text-[#00E599]" />
                  <span>Pair & Connect</span>
                </>
              )}
            </button>

            {/* File Upload Alternative for QR Image */}
            <label className="py-2.5 px-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-xs text-[#A1A1AA] hover:text-white border border-white/[0.08] flex items-center gap-1.5 cursor-pointer transition-all">
              <Upload className="w-3.5 h-3.5" />
              <span>Image</span>
              <input
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>
        </div>

        {/* Status Message */}
        {statusMessage && (
          <div
            className={`p-3 rounded-xl text-xs font-mono flex items-center gap-2 leading-relaxed ${
              statusType === 'error'
                ? 'bg-[#FF3B5C]/10 text-[#FF3B5C] border border-[#FF3B5C]/20'
                : statusType === 'success'
                ? 'bg-[#00E599]/10 text-[#00E599] border border-[#00E599]/20'
                : 'bg-[#7C5CFF]/10 text-[#A78BFA] border border-[#7C5CFF]/20'
            }`}
          >
            {statusType === 'error' && <AlertCircle className="w-4 h-4 shrink-0" />}
            {statusType === 'success' && <CheckCircle2 className="w-4 h-4 shrink-0" />}
            {statusType === 'info' && <RefreshCw className="w-4 h-4 shrink-0 animate-spin" />}
            <span>{statusMessage}</span>
          </div>
        )}

        {/* Footer */}
        <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between text-[11px] font-mono text-[#71717A]">
          <span>PC & Phone must be on same Wi-Fi</span>
          <button
            onClick={onEnterDemo}
            className="hover:text-white text-[#A78BFA] underline underline-offset-2 cursor-pointer"
          >
            Explore offline demo &rarr;
          </button>
        </div>
      </div>
    </div>
  );
};
