import React, { useState, useEffect, useRef } from 'react';
import VConsole from 'vconsole';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Clapperboard,
  Upload,
  Film,
  Sparkles,
  Download,
  Wand2,
  RefreshCw,
  AlertCircle,
  Key,
  ChevronRight,
  FileText,
  LogOut,
  CheckCircle2,
  Video,
  Disc,
  Music,
  Star
} from 'lucide-react';
import { AspectRatio, ASPECT_RATIO_LABELS } from './types';
import { generateSetPhoto, editSetPhoto, getMoviePosterImpression } from './services/geminiService';

// --- Types ---
interface GenerationState {
  isGenerating: boolean;
  isEditing: boolean;
  resultImages: string[];
  error: string | null;
}

interface DofOption {
  id: string;
  label: string;
  prompt: string;
}

const DOF_OPTIONS: DofOption[] = [
  {
    id: 'shallow',
    label: '浅景深 (背景虚化)',
    prompt: '使用f/1.2大光圈，极浅景深，背景呈现奶油般虚化效果，视觉焦点完全集中在人物面部'
  },
  {
    id: 'standard',
    label: '标准景深 (自然)',
    prompt: '使用f/4标准光圈，具有自然的景深过渡，背景微虚，保留一定的环境层次感'
  },
  {
    id: 'deep',
    label: '深景深 (全景清晰)',
    prompt: '使用f/11小光圈，深景深，人物与背景环境均清晰可见，强调人与场景的关系'
  }
];

// --- Prompt Template ---
const PROMPT_TEMPLATE = `【人物与面容】

核心人物： 以上传图片为唯一面部参考，100%精确重构该人物的面部骨骼结构、皮肤纹理、发型及神态。保持上传的人物主体不变，衣服着装不变。

[INSERT MOVIE NAME HERE]主演： 呈现其于电影拍摄期间的样貌、发型与神态。

互动状态： 两人身着各自的戏服，在电影拍摄间隙，进行一次即兴、欢乐的幕后合影。

【镜头与构图】

镜头： 专业人像摄影机模式拍摄，标准70-200mm镜头，[INSERT DOF HERE]，具有柔和的锐度与真实的肤色表现。

构图： [INSERT RATIO HERE]采用生活化、不拘谨的抓拍构图，两位主体位于画面中心或略微偏离中心，如同朋友随手拍摄的幕后花絮。

视角： 旁观者视角，仿佛你正站在片场，近距离为他们拍下这张照片。

【灯光与色彩】

主光源： 完全遵循所选电影场景的环境光逻辑。

辅助光： 可见片场补光设备的痕迹，如反光板带来的柔和补光或灯光架产生的细微光影，但需与自然光效完美融合，不显突兀。

色彩风格： 电影风格的色调，带有电影底片的质感。

【服装与造型】

上传人物着装：要求保持上传的人物主体不变，衣服着装不变

[INSERT MOVIE NAME HERE]主演着装： 根据所选电影经典场景，穿着完全符合剧中时代与角色的戏服。

【动作与场景】

核心动作： 电影拍摄被短暂打断。工作人员喊"来拍一张合影吧！"，两人闻声转向镜头，表情自然放松，姿态随意不刻意，洋溢着片场休息时的愉悦与默契。

经典场景：

环境： 电影中的经典场景环境。

关键元素： 画面中需明确可见电影拍摄现场的痕迹：电影摄影机、灯光架、收音麦克风杆、轨道车、部分入镜的工作人员、以及现场布景的辅助装置，共同构建一个"正在进行拍摄的片场"环境。

【画面风格与细节】

风格： 超写实渲染与iPhone生活快照感的融合。

细节： 模拟柯达Vision3 500T电影胶片质感，带有自然的银盐颗粒感（Film Grain）和微弱的随机噪点，拒绝AI生成的过度平滑感。极高的皮肤质感，可见自然纹理与毛孔。服装面料、场景道具均有真实磨损与使用痕迹。

画面氛围： 温暖、怀旧、充满人情味。如同一张偶然发现的、来自[INSERT MOVIE NAME HERE]片场的珍藏幕后照片，定格了轻松幸福的瞬间。

【最终画面感受总结】
一张超写实的照片，它让你感觉仿佛闯入了[INSERT MOVIE NAME HERE]的拍摄现场，并在某个拍摄间隙，为穿着戏服的主演和你朋友，用手机抓拍下了一张自然、欢乐而珍贵的幕后合影。`;

export default function App() {
  // --- State ---
  const [apiKey, setApiKey] = useState<string>('');
  const [showKeyInput, setShowKeyInput] = useState(true);
  const [keyError, setKeyError] = useState<string | null>(null);

  const [movieName, setMovieName] = useState('');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(AspectRatio.TIKTOK);
  const [dof, setDof] = useState<DofOption>(DOF_OPTIONS[0]);
  const [imageCount, setImageCount] = useState<1 | 2>(1);

  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [promptText, setPromptText] = useState('');

  // Trackers
  const [lastGeneratedMovie, setLastGeneratedMovie] = useState<string>('');
  const [lastGeneratedRatio, setLastGeneratedRatio] = useState<AspectRatio | null>(null);
  const [lastGeneratedDofPrompt, setLastGeneratedDofPrompt] = useState<string>('');

  const [editPrompt, setEditPrompt] = useState('');

  const [appState, setAppState] = useState<GenerationState>({
    isGenerating: false,
    isEditing: false,
    resultImages: [],
    error: null
  });

  const [selectedImageIndex, setSelectedImageIndex] = useState<number>(0);
  const [posterBackground, setPosterBackground] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const keyInputRef = useRef<HTMLInputElement>(null);

  // --- Mobile Debugging ---
  useEffect(() => {
    // Only init VConsole in development or if explicitly requested via URL param ?debug=true
    if (import.meta.env.DEV || new URLSearchParams(window.location.search).get('debug') === 'true') {
      const vConsole = new VConsole();
      return () => { vConsole.destroy(); };
    }
  }, []);

  // --- Initialization ---
  useEffect(() => {
    const storedKey = localStorage.getItem('gemini_api_key');
    if (storedKey) {
      setApiKey(storedKey);
      setShowKeyInput(false);
    }
  }, []);

  // --- Background Generation ---
  useEffect(() => {
    const trimmedMovie = movieName.trim();
    if (!trimmedMovie || !apiKey) return;

    const timer = setTimeout(() => {
      getMoviePosterImpression(apiKey, trimmedMovie)
        .then(url => {
          if (url) setPosterBackground(url);
        })
        .catch(err => console.error("Failed to load background", err));
    }, 1200);

    return () => clearTimeout(timer);
  }, [movieName, apiKey]);

  // --- Helpers ---
  const getRatioText = (ratio: AspectRatio) => ASPECT_RATIO_LABELS[ratio].split(' ')[1] + '竖幅';

  const buildPromptFromTemplate = (movie: string, ratio: AspectRatio, currentDof: DofOption) => {
    const moviePlaceholder = movie.trim() || '[电影名称]';
    const ratioText = getRatioText(ratio);

    return PROMPT_TEMPLATE
      .split('[INSERT MOVIE NAME HERE]').join(moviePlaceholder)
      .split('[INSERT RATIO HERE]').join(ratioText)
      .split('[INSERT DOF HERE]').join(currentDof.prompt);
  };

  // --- Handlers ---
  const handleSaveKey = () => {
    setKeyError(null);
    const rawKey = keyInputRef.current?.value.trim() || '';
    if (!rawKey) { setKeyError("请输入 API Key"); return; }
    // eslint-disable-next-line no-control-regex
    if (/[^\x00-\x7F]/.test(rawKey)) { setKeyError("API Key 包含非法字符。"); return; }
    localStorage.setItem('gemini_api_key', rawKey);
    setApiKey(rawKey);
    setShowKeyInput(false);
  };

  const handleClearKey = () => {
    localStorage.removeItem('gemini_api_key');
    setApiKey('');
    setShowKeyInput(true);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => { setUploadedImage(reader.result as string); };
      reader.readAsDataURL(file);
    }
  };

  const handleGeneratePrompt = () => {
    const newPrompt = buildPromptFromTemplate(movieName, aspectRatio, dof);
    setPromptText(newPrompt);
    setLastGeneratedMovie(movieName.trim() || '[电影名称]');
    setLastGeneratedRatio(aspectRatio);
    setLastGeneratedDofPrompt(dof.prompt);
  };

  const handleGenerate = async () => {
    if (!uploadedImage) { setAppState(prev => ({ ...prev, error: "请先上传一张您的照片" })); return; }
    if (!movieName) { setAppState(prev => ({ ...prev, error: "请输入电影名称" })); return; }
    if (!apiKey) { setShowKeyInput(true); return; }

    setAppState({ isGenerating: true, isEditing: false, resultImages: [], error: null });
    setSelectedImageIndex(0);

    let activePrompt = promptText;
    const currentMovie = movieName.trim();

    if (!activePrompt.trim()) {
      activePrompt = buildPromptFromTemplate(currentMovie, aspectRatio, dof);
      setLastGeneratedMovie(currentMovie);
      setLastGeneratedRatio(aspectRatio);
      setLastGeneratedDofPrompt(dof.prompt);
    } else {
      if (lastGeneratedMovie && lastGeneratedMovie !== currentMovie) {
        activePrompt = activePrompt.split(lastGeneratedMovie).join(currentMovie);
        setLastGeneratedMovie(currentMovie);
      }
      if (lastGeneratedRatio && lastGeneratedRatio !== aspectRatio) {
        const oldRatioText = getRatioText(lastGeneratedRatio);
        const newRatioText = getRatioText(aspectRatio);
        activePrompt = activePrompt.split(oldRatioText).join(newRatioText);
        setLastGeneratedRatio(aspectRatio);
      }
      if (lastGeneratedDofPrompt && lastGeneratedDofPrompt !== dof.prompt) {
        activePrompt = activePrompt.split(lastGeneratedDofPrompt).join(dof.prompt);
        setLastGeneratedDofPrompt(dof.prompt);
      }
    }
    setPromptText(activePrompt);

    try {
      const results = await generateSetPhoto(apiKey, activePrompt, uploadedImage, aspectRatio, imageCount);
      setAppState({ isGenerating: false, isEditing: false, resultImages: results, error: null });
    } catch (err: any) {
      let errorMessage = err.message || "生成失败";
      if (typeof errorMessage === 'string' && errorMessage.includes('ISO-8859-1')) {
        errorMessage = "API Key 包含非法字符，请重置。";
        handleClearKey();
      }
      setAppState({ isGenerating: false, isEditing: false, resultImages: [], error: errorMessage });
      if (errorMessage && (errorMessage.includes('API Key') || errorMessage.includes('403'))) {
        setShowKeyInput(true);
      }
    }
  };

  const handleEdit = async () => {
    const currentImage = appState.resultImages[selectedImageIndex];
    if (!currentImage || !editPrompt) return;
    if (!apiKey) { setShowKeyInput(true); return; }

    setAppState(prev => ({ ...prev, isEditing: true, error: null }));
    try {
      const result = await editSetPhoto(apiKey, currentImage, editPrompt);
      setAppState(prev => ({ ...prev, isEditing: false, resultImages: [...prev.resultImages, result] }));
      setSelectedImageIndex(appState.resultImages.length);
      setEditPrompt('');
    } catch (err: any) {
      setAppState(prev => ({ ...prev, isEditing: false, error: err.message || "编辑失败" }));
    }
  };

  const dataURLtoBlob = (dataurl: string) => {
    try {
      const arr = dataurl.split(',');
      if (arr.length < 2) return null;
      const match = arr[0].match(/:(.*?);/);
      const mime = match ? match[1] : 'image/png';
      const bstr = atob(arr[1]);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
      }
      return new Blob([u8arr], { type: mime });
    } catch (e) {
      console.error("Blob conversion failed", e);
      return null;
    }
  };

  const handleDownload = async () => {
    const currentImage = appState.resultImages[selectedImageIndex];
    if (!currentImage) return;

    try {
      const blob = dataURLtoBlob(currentImage);
      if (!blob) {
        throw new Error("Image data is invalid");
      }

      const file = new File([blob], `hollywood-cut-${Date.now()}.png`, { type: blob.type });

      // Try Web Share API first (Mobile friendly)
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: 'Hollywood Cut',
            text: 'My Hollywood Set Visit Photo'
          });
          return; // Shared successfully
        } catch (shareError) {
          // User cancelled or share failed, proceed to fallback
          console.log('Share dismissed, falling back to download');
        }
      }

      // Fallback: Blob URL Download
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `hollywood-cut-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Cleanup
      setTimeout(() => URL.revokeObjectURL(blobUrl), 100);

    } catch (error) {
      console.error("Download/Share failed:", error);
      // Fallback for extreme cases: Open Image directly
      const newTab = window.open();
      if (newTab) {
        newTab.document.write(`<img src="${currentImage}" style="width:100%;" />`);
        newTab.document.title = "Save Image";
        alert("请长按图片保存");
      }
    }
  };

  // --- UI Components ---

  const LoadingOverlay = ({ text }: { text: string }) => (
    <div className="absolute inset-0 z-10 bg-white/60 backdrop-blur-md flex flex-col items-center justify-center border-2 border-[#002FA7]/20 rounded-xl">
      <div className="relative w-24 h-24 mb-4">
        <motion.div
          className="absolute inset-0 border-4 border-[#002FA7]/20 rounded-full"
          animate={{ scale: [1, 1.1, 1], opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
        <motion.div
          className="absolute inset-0 border-t-4 border-[#FF4500] rounded-full"
          animate={{ rotate: 360 }}
          transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
        />
      </div>
      <p className="text-[#002FA7] font-bold font-serif tracking-widest animate-pulse">{text}</p>
    </div>
  );

  const JazzFooter = () => (
    <div className="fixed bottom-0 left-0 w-full h-10 bg-[#002FA7] text-[#FAF9F6] flex items-center justify-between px-4 z-40 overflow-hidden shadow-[0_-4px_20px_rgba(0,47,167,0.3)]">
      <div className="flex w-full justify-between items-center text-[10px] md:text-xs font-mono tracking-widest uppercase">
        <div className="flex items-center gap-4">
          <span className="hidden md:inline font-serif italic font-black">HOLLYWOOD CUT</span>
          <span>★</span>
          <span>JAZZ & WESTERN EDITION</span>
        </div>
        <div className="flex items-center gap-4">
          <span>NO. 00-2F-A7</span>
          <span>★</span>
          <span className="hidden md:inline">KLEIN BLUE STUDIO</span>
        </div>
      </div>
    </div>
  );

  // --- Background ---
  const LivelyBackground = ({ poster }: { poster: string | null }) => (
    <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10 bg-[#FAF9F6]">
      {/* Dynamic Poster Layer */}
      <AnimatePresence>
        {poster && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.15 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.5 }}
            className="absolute inset-0 z-0"
          >
            <img
              src={poster}
              alt="Atmosphere"
              className="w-full h-full object-cover blur-3xl scale-110 grayscale mix-blend-multiply"
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Decorative Jazz/Western Elements */}
      <div className="absolute inset-0 z-0 text-[#002FA7]">
        {/* Music Notes - Increased Opacity for Cleaner Look */}
        <Music className="absolute top-[10%] left-[10%] w-32 h-32 -rotate-12 opacity-[0.08]" />
        <Music className="absolute bottom-[20%] right-[15%] w-24 h-24 rotate-12 opacity-[0.08]" />

        {/* Western Stars - Increased Opacity */}
        <Star className="absolute top-[20%] right-[10%] w-16 h-16 fill-current text-[#FF4500] opacity-20" />
        <Star className="absolute bottom-[15%] left-[5%] w-20 h-20 fill-current text-[#8B4513] opacity-20" />

        {/* Abstract Shapes (Jazz Cutouts) */}
        <div className="absolute top-[40%] left-[-5%] w-64 h-64 rounded-full border-4 border-dashed border-[#002FA7] opacity-10"></div>
        <div className="absolute top-[-10%] right-[20%] w-40 h-96 bg-[#002FA7] mix-blend-multiply opacity-[0.05] rotate-45"></div>
      </div>

      {/* Gradient Wash - Subtle Warmth */}
      <div className="absolute inset-0 bg-gradient-to-br from-white via-transparent to-[#FF4500]/5 z-0"></div>
    </div>
  );

  // --- Welcome Screen ---
  if (showKeyInput) {
    return (
      <div className="min-h-screen bg-[#FAF9F6] text-[#002FA7] flex flex-col items-center justify-center p-6 relative overflow-hidden">
        <LivelyBackground poster={null} />
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-white border-4 border-[#002FA7] p-8 shadow-[12px_12px_0px_0px_rgba(0,47,167,1)] relative z-10"
        >
          {/* Decorative Corner Stars */}
          <Star className="absolute top-2 left-2 w-4 h-4 text-[#FF4500] fill-current" />
          <Star className="absolute top-2 right-2 w-4 h-4 text-[#FF4500] fill-current" />
          <Star className="absolute bottom-2 left-2 w-4 h-4 text-[#FF4500] fill-current" />
          <Star className="absolute bottom-2 right-2 w-4 h-4 text-[#FF4500] fill-current" />

          <div className="flex flex-col items-center text-center space-y-6">
            <div className="w-20 h-20 bg-[#002FA7] rounded-full flex items-center justify-center text-white ring-4 ring-[#FF4500] ring-offset-4 ring-offset-white shadow-xl">
              <Clapperboard className="w-10 h-10" />
            </div>
            <div className="space-y-2">
              <h1 className="text-4xl font-black font-serif italic text-[#002FA7] tracking-tight">HOLLYWOOD <span className="text-[#FF4500]">CUT</span></h1>
              <p className="text-[#8B4513] font-medium font-serif italic text-lg">
                好莱坞片场之旅
              </p>
            </div>
            <div className="w-full space-y-4">
              <input
                ref={keyInputRef}
                type="password"
                placeholder="在此粘贴您的 KIE API Key"
                className="w-full bg-[#FAF9F6] border-2 border-[#002FA7] py-3 px-4 text-[#002FA7] font-mono focus:outline-none focus:ring-4 focus:ring-[#FF4500]/30 transition-all placeholder:text-[#002FA7]/40 text-center"
              />
              {keyError && (
                <div className="flex items-center justify-center gap-2 text-[#FF4500] font-bold text-xs">
                  <AlertCircle className="w-4 h-4" />
                  <span>{keyError}</span>
                </div>
              )}
              <button
                onClick={handleSaveKey}
                className="w-full py-3 bg-[#002FA7] text-white font-bold text-lg hover:bg-[#FF4500] transition-colors shadow-lg flex items-center justify-center gap-2"
              >
                进入电影片场
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
            <a href="https://kie.ai/api-key" target="_blank" rel="noreferrer" className="text-xs text-[#002FA7]/60 hover:text-[#FF4500] font-mono underline decoration-dashed underline-offset-4">
              获取 KIE API Key &rarr;
            </a>
          </div>
        </motion.div>
        <div className="absolute bottom-8 text-[#002FA7]/40 text-sm font-black tracking-widest uppercase">
          KLEIN BLUE EDITION
        </div>
      </div>
    );
  }

  // --- Main App ---
  return (
    <div className="min-h-screen text-[#002FA7] pb-20 flex flex-col items-center relative overflow-x-hidden bg-[#FAF9F6]">
      <LivelyBackground poster={posterBackground} />

      <header className="w-full max-w-6xl mt-8 mb-10 flex flex-col items-center text-center space-y-4 px-4 relative z-10">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }} className="flex flex-col items-center relative">
          <div className="inline-block bg-[#002FA7] text-white px-2 py-1 mb-2 transform -rotate-2 shadow-md">
            <span className="text-xs font-bold font-mono tracking-widest uppercase">Production: MovieCut</span>
          </div>
          <h1 className="text-6xl md:text-8xl font-black font-serif italic text-[#002FA7] tracking-tighter leading-none drop-shadow-sm">
            Hollywood <span className="text-[#FF4500]">Cut</span>
          </h1>
          <p className="mt-4 text-[#8B4513] font-medium font-serif text-lg tracking-wide border-b-2 border-[#FF4500] border-dashed pb-1">
            打造您的专属电影时刻
          </p>
          <button onClick={handleClearKey} className="absolute top-2 right-[-80px] hidden lg:flex items-center gap-1 text-[10px] text-[#002FA7]/50 hover:text-[#FF4500] font-mono font-bold" title="清除 Key">
            <LogOut className="w-3 h-3" /> RESET
          </button>
        </motion.div>
      </header>

      <main className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16 px-6 relative z-10">

        {/* Left Column: Controls */}
        <motion.section initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="space-y-8">

          {/* Upload */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-3 h-3 bg-[#002FA7] rotate-45"></div>
              <h2 className="text-sm font-black font-sans tracking-widest text-[#002FA7] uppercase">上传素材 (Upload)</h2>
              <div className="h-0.5 bg-[#002FA7]/20 flex-grow"></div>
            </div>

            <div onClick={() => fileInputRef.current?.click()} className="group cursor-pointer relative w-full h-40 bg-white border-2 border-dashed border-[#002FA7] hover:border-[#FF4500] hover:bg-[#fffbf0] transition-all flex flex-col items-center justify-center overflow-hidden shadow-sm">
              <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*" />
              {uploadedImage ? (
                <img src={uploadedImage} alt="Preview" className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity" />
              ) : (
                <div className="flex flex-col items-center text-[#002FA7]/60 group-hover:text-[#FF4500] transition-colors">
                  <Upload className="w-8 h-8 mb-2 stroke-[1.5]" />
                  <span className="text-xs font-bold font-mono uppercase tracking-wider">点击上传人物参考图</span>
                </div>
              )}
              {uploadedImage && (
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-white/20 backdrop-blur-sm">
                  <p className="bg-[#002FA7] px-4 py-2 text-xs font-bold text-white shadow-lg transform -rotate-2">更换素材</p>
                </div>
              )}
            </div>
          </div>

          {/* Movie Details */}
          <div className="space-y-5 bg-white p-6 border-2 border-[#002FA7] shadow-[8px_8px_0px_0px_rgba(255,69,0,0.2)]">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-3 h-3 bg-[#FF4500] rounded-full"></div>
              <h2 className="text-sm font-black font-sans tracking-widest text-[#002FA7] uppercase">场景设定 (Scene)</h2>
            </div>

            <div className="space-y-2">
              <label className="text-xs text-[#8B4513] font-bold uppercase font-mono">电影名称</label>
              <div className="relative">
                <Film className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#002FA7]" />
                <input
                  type="text"
                  value={movieName}
                  onChange={(e) => setMovieName(e.target.value)}
                  placeholder="例如: 爱乐之城 (La La Land)"
                  className="w-full bg-[#FAF9F6] border-b-2 border-[#002FA7]/30 py-3 pl-10 pr-4 text-[#002FA7] focus:outline-none focus:border-[#FF4500] focus:bg-white transition-all placeholder:text-[#002FA7]/30 font-serif text-lg font-bold"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs text-[#8B4513] font-bold uppercase font-mono">画幅比例</label>
              <div className="flex gap-2">
                {Object.values(AspectRatio).map((ratio) => (
                  <button
                    key={ratio}
                    onClick={() => setAspectRatio(ratio)}
                    className={`flex-1 py-2 px-1 text-[10px] md:text-xs font-bold font-mono border-2 transition-all 
                      ${aspectRatio === ratio
                        ? 'bg-[#FF4500] text-white border-[#FF4500] shadow-md transform -translate-y-0.5'
                        : 'bg-transparent border-[#002FA7]/20 text-[#002FA7]/60 hover:border-[#FF4500] hover:text-[#FF4500]'
                      }`}
                  >
                    {ASPECT_RATIO_LABELS[ratio].split(' ')[1]}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs text-[#8B4513] font-bold uppercase font-mono">镜头景深</label>
              <div className="flex gap-2">
                {DOF_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    onClick={() => setDof(option)}
                    className={`flex-1 py-2 px-1 text-[10px] md:text-xs font-bold font-mono border-2 transition-all 
                      ${dof.id === option.id
                        ? 'bg-[#FF4500] text-white border-[#FF4500] shadow-md transform -translate-y-0.5'
                        : 'bg-transparent border-[#002FA7]/20 text-[#002FA7]/60 hover:border-[#FF4500] hover:text-[#FF4500]'
                      }`}
                  >
                    {option.label.split(' ')[0]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Prompt Engine */}
          <div className="space-y-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-[#002FA7] rotate-45"></div>
                <h2 className="text-sm font-black font-sans tracking-widest text-[#002FA7] uppercase">导演指令 (Director)</h2>
              </div>
              <button onClick={handleGeneratePrompt} className="text-xs bg-[#002FA7] hover:bg-[#002280] text-white px-3 py-1 font-bold flex items-center gap-1 transition-colors shadow-sm transform hover:-rotate-1">
                <FileText className="w-3 h-3" /> 生成指令
              </button>
            </div>

            <div className="relative group">
              <textarea
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                placeholder="输入电影名称后点击上方按钮..."
                className="w-full h-40 bg-white border-2 border-[#002FA7]/20 rounded-none p-4 text-xs text-[#002FA7] font-mono resize-none focus:outline-none focus:border-[#002FA7] focus:shadow-inner transition-all leading-relaxed"
                spellCheck={false}
              />
              {/* Paper corner fold effect */}
              <div className="absolute top-0 right-0 border-t-[20px] border-r-[20px] border-t-[#FAF9F6] border-r-[#002FA7]/10 pointer-events-none"></div>
            </div>
          </div>

          {/* Action Area */}
          <div className="space-y-4 pt-4 border-t-2 border-dashed border-[#002FA7]/20">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold font-mono text-[#8B4513] uppercase">QUANTITY / 数量</span>
              <div className="flex border-2 border-[#002FA7] bg-white">
                <button
                  onClick={() => setImageCount(1)}
                  className={`px-4 py-1 font-bold text-xs ${imageCount === 1 ? 'bg-[#FF4500] text-white' : 'text-[#002FA7] hover:bg-blue-50'}`}
                >
                  x1
                </button>
                <button
                  onClick={() => setImageCount(2)}
                  className={`px-4 py-1 font-bold text-xs ${imageCount === 2 ? 'bg-[#FF4500] text-white' : 'text-[#002FA7] hover:bg-blue-50'}`}
                >
                  x2
                </button>
              </div>
            </div>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleGenerate}
              disabled={appState.isGenerating || appState.isEditing}
              className={`w-full py-5 font-black text-2xl tracking-widest shadow-[8px_8px_0px_0px_#002FA7] flex items-center justify-center gap-3 transition-all uppercase relative overflow-hidden border-4 border-[#002FA7]
                ${appState.isGenerating
                  ? 'bg-gray-100 text-gray-400 border-gray-300 cursor-wait shadow-none'
                  : 'bg-[#FF4500] text-white hover:bg-[#FF5714] hover:shadow-[10px_10px_0px_0px_#002FA7]'
                }`}
            >
              {appState.isGenerating ? (
                <span className="font-mono text-sm animate-pulse text-[#002FA7]">PROCESSING...</span>
              ) : (
                <>
                  <Sparkles className="w-6 h-6" /> ACTION!
                </>
              )}
            </motion.button>
          </div>

          {appState.error && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="p-4 bg-red-50 border-l-4 border-[#FF4500] text-[#FF4500] flex items-start gap-3">
              <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
              <p className="text-xs font-bold font-mono">{appState.error}</p>
            </motion.div>
          )}

        </motion.section>

        {/* Right Column: Result & Edit */}
        <motion.section initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="flex flex-col h-full space-y-6 pb-20">

          {/* Main Image Display */}
          <div className="relative flex-grow min-h-[500px] bg-white border-4 border-[#002FA7] flex items-center justify-center overflow-hidden shadow-2xl flex-col p-2">

            {/* Inner Border */}
            <div className="absolute inset-2 border border-dashed border-[#002FA7]/30 pointer-events-none z-20"></div>

            <AnimatePresence>
              {appState.isGenerating && <LoadingOverlay text="DEVELOPING..." />}
              {appState.isEditing && <LoadingOverlay text="EDITING..." />}
            </AnimatePresence>

            {!appState.resultImages.length && !appState.isGenerating && (
              <div className="flex flex-col items-center text-[#002FA7]/30 space-y-4 p-8 text-center z-10">
                <div className="w-32 h-32 rounded-full border-4 border-dashed border-[#002FA7]/20 flex items-center justify-center bg-[#FAF9F6]">
                  <Video className="w-12 h-12" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-2xl font-['Rye'] font-bold text-[#002FA7]/50 tracking-widest">NO SIGNAL</h3>
                  <p className="text-xs font-mono font-bold uppercase tracking-widest text-[#FF4500]/50">Standby for Action</p>
                </div>
              </div>
            )}

            {/* Display Selected Image */}
            {appState.resultImages.length > 0 && (
              <motion.img
                key={selectedImageIndex}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, type: "spring" }}
                src={appState.resultImages[selectedImageIndex]}
                alt="Generated Result"
                className="w-full h-full object-contain max-h-[85vh] z-10 relative shadow-inner"
              />
            )}

            {/* Download Button */}
            {appState.resultImages.length > 0 && !appState.isGenerating && !appState.isEditing && (
              <div className="absolute bottom-6 right-6 flex gap-2 z-30">
                <motion.button
                  whileHover={{ scale: 1.1, rotate: 10 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={handleDownload}
                  className="p-4 bg-[#FF4500] text-white rounded-full border-4 border-white shadow-xl hover:bg-[#FF5714]"
                  title="保存成片"
                >
                  <Download className="w-6 h-6" />
                </motion.button>
              </div>
            )}
          </div>

          {/* Gallery / Selection for x2 */}
          {appState.resultImages.length > 1 && (
            <div className="flex gap-4 justify-center flex-wrap">
              {appState.resultImages.map((img, idx) => (
                <button
                  key={idx}
                  onClick={() => setSelectedImageIndex(idx)}
                  className={`relative w-24 h-24 border-4 transition-all transform ${selectedImageIndex === idx ? 'border-[#FF4500] rotate-2 scale-110 shadow-lg z-10' : 'border-gray-200 rotate-0 scale-100 hover:rotate-1'}`}
                >
                  <img src={img} alt={`take-${idx}`} className="w-full h-full object-cover" />
                  {selectedImageIndex === idx && (
                    <div className="absolute -top-2 -right-2 bg-[#FF4500] rounded-full p-1 border-2 border-white">
                      <CheckCircle2 className="w-4 h-4 text-white" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Image Editing (Nano Banana) */}
          <AnimatePresence>
            {appState.resultImages.length > 0 && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white border-2 border-[#002FA7] p-4 shadow-[4px_4px_0px_0px_rgba(0,47,167,0.2)]">
                <div className="flex items-center gap-2 text-[#002FA7] mb-2">
                  <Wand2 className="w-4 h-4" />
                  <span className="text-xs font-black font-mono uppercase tracking-wider">POST-PRODUCTION (Magic Edit)</span>
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={editPrompt}
                    onChange={(e) => setEditPrompt(e.target.value)}
                    placeholder="输入指令: 增加噪点, 变成黑白, 移除路人..."
                    className="flex-grow bg-[#FAF9F6] border border-[#002FA7]/30 py-2 px-4 text-xs md:text-sm text-[#002FA7] focus:outline-none focus:border-[#FF4500] font-mono"
                    onKeyDown={(e) => e.key === 'Enter' && handleEdit()}
                  />
                  <button
                    onClick={handleEdit}
                    disabled={!editPrompt.trim() || appState.isEditing}
                    className="bg-[#002FA7] text-white px-4 py-2 text-xs font-bold uppercase tracking-wider hover:bg-[#002280] disabled:opacity-50 disabled:cursor-not-allowed shadow-md flex items-center gap-2"
                  >
                    {appState.isEditing ? <RefreshCw className="w-3 h-3 animate-spin" /> : "APPLY CUT"}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

        </motion.section>
      </main>
      <JazzFooter />
    </div>
  );
}