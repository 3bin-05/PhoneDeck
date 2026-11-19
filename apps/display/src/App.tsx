import { useDeckBridge } from './useDeckBridge';
import { MainDeckView } from './MainDeckView';

export default function App() {
  // Maintain background telemetry connection and bridge with Rust core
  useDeckBridge();

  return (
    <div className="w-full h-screen bg-[#070709] text-white select-none overflow-hidden font-mono">
      <MainDeckView />
    </div>
  );
}
