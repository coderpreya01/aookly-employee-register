import { Navigate, NavLink, Route, Routes } from "react-router-dom";
import RegisterEmployee from "./components/RegisterEmployee";
import Dashboard from "./components/Dashboard";
import elekgoLogo from "./asset/elekgo (1).webp";

export default function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur shadow-sm">
        <div className="h-0.5 w-full bg-gradient-to-r from-[#c0392b] via-[#e74c3c] to-[#c0392b]" />
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-3 sm:flex-row sm:px-6 lg:px-8">
          <NavLink to="/" className="flex items-center">
            <img
              src={elekgoLogo}
              alt="ElekGo"
              className="h-10 w-auto select-none object-contain"
              draggable="false"
            />
          </NavLink>

          <nav className="flex items-center gap-2 rounded-xl bg-slate-100 p-1">
            {/* <NavLink
              to="/"
              end
              className={({ isActive }) =>
                `rounded-lg px-4 py-1.5 text-xs font-semibold transition-all ${isActive
                  ? "bg-white text-[#c0392b] shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
                }`
              }
            >
              Register Employee
            </NavLink> */}
            {/* <NavLink
              to="/dashboard"
              className={({ isActive }) =>
                `rounded-lg px-4 py-1.5 text-xs font-semibold transition-all ${
                  isActive
                    ? "bg-white text-[#c0392b] shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`
              }
            >
              Dashboard
            </NavLink> */}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        <Routes>
          <Route path="/" element={<RegisterEmployee />} />
          <Route path="/register-alphabet" element={<RegisterEmployee />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      <footer className="border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-400">
        &copy; {new Date().getFullYear()} ElekGo &mdash; Employee Registration System
      </footer>
    </div>
  );
}