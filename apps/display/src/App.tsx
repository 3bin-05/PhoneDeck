import { motion, AnimatePresence } from 'framer-motion';
import { useDeckBridge } from './useDeckBridge';
import { useDeckStore, useActivePage } from './deckStore';
import { MainDeckView } from './MainDeckView';
import { AppLauncherDeckView } from './AppLauncherDeckView';

export default function App() {
  // Maintain background telemetry connection and bridge with Rust core
  useDeckBridge();

  const activePage = useActivePage();

  return (
    <div className="w-full h-screen bg-[#070709] text-white select-none overflow-hidden font-mono relative">
      <AnimatePresence mode="wait">
        {activePage === 0 ? (
          <motion.div
            key="page-0"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            onDragEnd={(_, info) => {
              if (info.offset.x < -50) useDeckStore.getState().setPage(1);
            }}
            className="w-full h-full"
          >
            <MainDeckView />
          </motion.div>
        ) : (
          <motion.div
            key="page-1"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.2 }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            onDragEnd={(_, info) => {
              if (info.offset.x > 50) useDeckStore.getState().setPage(0);
            }}
            className="w-full h-full"
          >
            <AppLauncherDeckView />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Subtle Page Indicators at Bottom Center */}
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-2.5 z-30 pointer-events-auto bg-black/60 backdrop-blur-md px-3 py-1 rounded-full border border-white/10 shadow-lg">
        <button
          onClick={() => useDeckStore.getState().setPage(0)}
          className={`w-2 h-2 rounded-full transition-all cursor-pointer ${
            activePage === 0 ? 'bg-white scale-125 shadow-[0_0_6px_#ffffff]' : 'bg-zinc-600 hover:bg-zinc-400'
          }`}
          title="Screen 1: Main Dashboard"
        />
        <button
          onClick={() => useDeckStore.getState().setPage(1)}
          className={`w-2 h-2 rounded-full transition-all cursor-pointer ${
            activePage === 1 ? 'bg-white scale-125 shadow-[0_0_6px_#ffffff]' : 'bg-zinc-600 hover:bg-zinc-400'
          }`}
          title="Screen 2: App Launcher"
        />
      </div>
    </div>
  );
}
