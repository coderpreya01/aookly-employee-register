import { Navigate, Route, Routes } from "react-router-dom";
import RegisterEmployee from "./components/RegisterEmployee";
import elekgoLogo from "./asset/elekgo (1).webp";

export default function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-20 bg-white shadow-sm">
        <div className="h-0.5 w-full bg-gradient-to-r from-[#c0392b] via-[#e74c3c] to-[#c0392b]" />
        <div className="mx-auto flex max-w-6xl items-center justify-center px-4 py-3 sm:px-6 lg:px-8">
          <img
            src={elekgoLogo}
            alt="ElekGo"
            className="h-10 w-auto select-none object-contain"
            draggable="false"
          />
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        <Routes>
          <Route path="/" element={<RegisterEmployee />} />
          <Route path="/register-alphabet" element={<RegisterEmployee />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      <footer className="border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-400">
        &copy; {new Date().getFullYear()} ElekGo &mdash; Employee Registration System
      </footer>
    </div>
  );
}