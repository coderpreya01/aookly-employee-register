import { useEffect, useState } from 'react';
import PhotoSlot from './PhotoSlot.jsx';

const API = import.meta.env.VITE_API_URL || '';
const EMPTY = { employeeId: '', name: '', email: '', designation: '', department: '' };

/* ── Field Icons ─────────────────────────────────────────────────────── */
const ICONS = {
  employeeId: (
    <svg className="h-4 w-4 text-slate-400" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M10 2a4 4 0 100 8 4 4 0 000-8zm-8 14a8 8 0 1116 0H2z" clipRule="evenodd"/>
    </svg>
  ),
  name: (
    <svg className="h-4 w-4 text-slate-400" viewBox="0 0 20 20" fill="currentColor">
      <path d="M9 12h6m-3-3v6M5 5a2 2 0 012-2h6a2 2 0 012 2v2H5V5z"/>
    </svg>
  ),
  email: (
    <svg className="h-4 w-4 text-slate-400" viewBox="0 0 20 20" fill="currentColor">
      <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z"/>
      <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z"/>
    </svg>
  ),
  designation: (
    <svg className="h-4 w-4 text-slate-400" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M6 6V5a3 3 0 013-3h2a3 3 0 013 3v1h2a2 2 0 012 2v3.57A22.952 22.952 0 0110 13a22.95 22.95 0 01-8-1.43V8a2 2 0 012-2h2zm2-1a1 1 0 011-1h2a1 1 0 011 1v1H8V5zm1 5a1 1 0 011-1h.01a1 1 0 110 2H10a1 1 0 01-1-1z" clipRule="evenodd"/>
      <path d="M2 13.692V16a2 2 0 002 2h12a2 2 0 002-2v-2.308A24.974 24.974 0 0110 15c-2.796 0-5.487-.46-8-1.308z"/>
    </svg>
  ),
  department: (
    <svg className="h-4 w-4 text-slate-400" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a1 1 0 01-1.581.814L10 14.696l-4.419 2.118A1 1 0 014 16V4z" clipRule="evenodd"/>
    </svg>
  ),
};

export default function RegisterEmployee() {
  const [formData, setFormData] = useState(EMPTY);
  const [photos, setPhotos] = useState([null, null, null]);
  const [previews, setPreviews] = useState([null, null, null]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState({ type: '', text: '' });

  useEffect(() => () => previews.forEach((p) => p && URL.revokeObjectURL(p)), [previews]);

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const handlePhotoSet = (index, file) => {
    const newPhotos = [...photos];
    const newPreviews = [...previews];
    if (newPreviews[index]) URL.revokeObjectURL(newPreviews[index]);
    newPhotos[index] = file;
    newPreviews[index] = file ? URL.createObjectURL(file) : null;
    setPhotos(newPhotos);
    setPreviews(newPreviews);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (photos.some((p) => p === null)) {
      setStatus({ type: 'error', text: 'Please upload all 3 required photos.' });
      return;
    }
    setLoading(true);
    setStatus({ type: '', text: '' });
    const body = new FormData();
    Object.entries(formData).forEach(([k, v]) => body.append(k, v.trim()));
    photos.forEach((p, i) => body.append(`photo_${i + 1}`, p));
    try {
      const res = await fetch(`${API}/api/register-employee`, { method: 'POST', body });
      const data = await res.json();
      if (res.ok) {
        setStatus({ type: 'success', text: '✓  Employee registered successfully!' });
        setFormData(EMPTY);
        setPhotos([null, null, null]);
        setPreviews([null, null, null]);
      } else {
        const detail = Array.isArray(data.detail) ? 'Please fill in all fields correctly.' : data.detail;
        setStatus({ type: 'error', text: detail || 'Registration failed. Please try again.' });
      }
    } catch {
      setStatus({ type: 'error', text: 'Cannot connect to server. Check your network.' });
    } finally {
      setLoading(false);
    }
  };

  /* Progress dots */
  const photoCount = photos.filter(Boolean).length;
  const fieldsFilled = Object.values(formData).every((v) => v.trim() !== '');

  /* Render a form field with icon */
  const Field = ({ name, label, placeholder, type = 'text', colSpan = '' }) => (
    <label className={`block ${colSpan}`}>
      <span className="mb-1.5 flex items-center gap-1.5 text-[13px] font-semibold text-slate-600">
        {ICONS[name]}
        {label}
      </span>
      <input
        className="input-field"
        type={type}
        name={name}
        value={formData[name]}
        onChange={handleChange}
        required
        placeholder={placeholder}
        id={`field-${name}`}
      />
    </label>
  );

  return (
    <div className="mx-auto w-full max-w-2xl xl:max-w-3xl">
      {/* ── Page header ── */}
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-800 sm:text-3xl">
          Employee Registration
        </h1>
        <p className="mt-1.5 text-sm text-slate-500">
          Fill in the details below and upload three face photos to complete registration.
        </p>

        {/* Progress bar */}
        <div className="mt-4 flex items-center justify-center gap-3">
          <Step done={fieldsFilled} label="Details" num={1} />
          <div className="h-px w-8 bg-slate-200" />
          <Step done={photoCount === 3} label="Photos" num={2} />
          <div className="h-px w-8 bg-slate-200" />
          <Step done={fieldsFilled && photoCount === 3} label="Submit" num={3} />
        </div>
      </div>

      {/* ── Main card ── */}
      <div className="card-glass rounded-2xl border border-white/80 p-6 shadow-xl shadow-slate-200/60 sm:p-8">
        <form onSubmit={handleSubmit} className="space-y-6">

          {/* ── Section 1: Employee Details ── */}
          <div>
            <SectionHeader icon="👤" title="Employee Details" />
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field name="employeeId" label="Employee ID" placeholder="e.g. EMP001" />
              <Field name="name" label="Full Name" placeholder="Enter full name" />
              <Field name="email" label="Email Address" placeholder="name@company.com" type="email" />
              <Field name="designation" label="Designation" placeholder="e.g. Software Engineer" />
              <Field name="department" label="Department" placeholder="e.g. Engineering" colSpan="sm:col-span-2" />
            </div>
          </div>

          {/* ── Divider ── */}
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-slate-100" />
            <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Face Photos</span>
            <div className="h-px flex-1 bg-slate-100" />
          </div>

          {/* ── Section 2: Photos ── */}
          <div>
            <SectionHeader icon="📸" title="Upload 3 Face Photos" />
            <p className="mt-1 text-[12px] text-slate-500">
              Provide all three poses for accurate face recognition.
              Each photo must show <strong>one clear face</strong> in good lighting.
            </p>

            {/* Photo progress pills */}
            <div className="mt-3 flex items-center gap-2">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                    photos[i] ? 'bg-[#c0392b]' : 'bg-slate-200'
                  }`}
                />
              ))}
              <span className="ml-1 text-[11px] font-semibold text-slate-500">{photoCount}/3</span>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <PhotoSlot
                  key={i}
                  index={i}
                  file={photos[i]}
                  preview={previews[i]}
                  onPhotoSet={handlePhotoSet}
                />
              ))}
            </div>
          </div>

          {/* ── Status message ── */}
          {status.text && (
            <div
              role="status"
              className={`flex items-start gap-2.5 rounded-xl px-4 py-3 text-sm font-medium ${
                status.type === 'success'
                  ? 'border border-emerald-200 bg-emerald-50 text-emerald-800'
                  : 'border border-red-200 bg-red-50 text-red-800'
              }`}
            >
              <span className="mt-px text-base">{status.type === 'success' ? '✅' : '⚠️'}</span>
              <span>{status.text}</span>
            </div>
          )}

          {/* ── Submit button ── */}
          <button
            type="submit"
            id="btn-register-submit"
            disabled={loading}
            className="btn-primary flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                </svg>
                Registering…
              </>
            ) : (
              <>
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd"/>
                </svg>
                Register Employee
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

/* ── Helper: Section header ────────────────────────────────────────── */
function SectionHeader({ icon, title }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-base">{icon}</span>
      <h2 className="text-sm font-bold text-slate-800 sm:text-[15px]">{title}</h2>
    </div>
  );
}

/* ── Helper: Progress step ─────────────────────────────────────────── */
function Step({ num, label, done }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={`flex h-7 w-7 items-center justify-center rounded-full border-2 text-[11px] font-bold transition-all duration-300 ${
          done
            ? 'border-[#c0392b] bg-[#c0392b] text-white'
            : 'border-slate-300 bg-white text-slate-400'
        }`}
      >
        {done ? '✓' : num}
      </div>
      <span className={`text-[10px] font-semibold ${done ? 'text-[#c0392b]' : 'text-slate-400'}`}>{label}</span>
    </div>
  );
}