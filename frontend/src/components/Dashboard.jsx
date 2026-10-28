import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import PhotoSlot from './PhotoSlot.jsx';

const API = import.meta.env.VITE_API_URL || '';
const PAGE_SIZE = 15;

const POSE_INFO = [
  { label: 'Left Side Profile', short: 'Left', color: 'from-indigo-500 to-indigo-600', badge: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  { label: 'Right Side Profile', short: 'Right', color: 'from-purple-500 to-purple-600', badge: 'bg-purple-50 text-purple-700 border-purple-200' },
  { label: 'Front Face', short: 'Front', color: 'from-sky-500 to-sky-600', badge: 'bg-sky-50 text-sky-700 border-sky-200' },
];

export const getPhotoUrl = (url) => {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('blob:') || url.startsWith('data:')) {
    return url;
  }
  return `${API}${url.startsWith('/') ? '' : '/'}${url}`;
};

export default function Dashboard() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [toast, setToast] = useState(null); // { type: 'success' | 'error', message: '' }

  // Lightbox Modal state
  const [activeLightbox, setActiveLightbox] = useState(null); // { employee, photoIndex }

  // Delete Modal state
  const [deletingEmployee, setDeletingEmployee] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Edit Modal state
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [editFormData, setEditFormData] = useState({ name: '', email: '', designation: '', department: '' });
  const [editPhotos, setEditPhotos] = useState([null, null, null]);
  const [editPreviews, setEditPreviews] = useState(['', '', '']);
  const [isSaving, setIsSaving] = useState(false);
  const [editError, setEditError] = useState('');

  const showToast = (type, message) => {
    setToast({ type, message });
    setTimeout(() => {
      setToast(null);
    }, 4500);
  };

  const fetchEmployees = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/api/dashboard`);
      if (!res.ok) {
        throw new Error(`Failed to load employees (${res.status})`);
      }
      const data = await res.json();
      setEmployees(data.employees || []);
    } catch (err) {
      console.error('Error fetching dashboard employees:', err);
      setError(err.message || 'Failed to fetch registered employee details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployees();
  }, []);

  // Filter employees based on search query
  const filteredEmployees = useMemo(() => {
    if (!search.trim()) return employees;
    const q = search.toLowerCase();
    return employees.filter(
      (emp) =>
        emp.name?.toLowerCase().includes(q) ||
        emp.employee_id?.toLowerCase().includes(q) ||
        emp.email?.toLowerCase().includes(q) ||
        emp.department?.toLowerCase().includes(q) ||
        emp.designation?.toLowerCase().includes(q)
    );
  }, [employees, search]);

  // Reset to page 1 whenever search query changes
  useEffect(() => {
    setCurrentPage(1);
  }, [search]);

  // Pagination calculations
  const totalPages = Math.ceil(filteredEmployees.length / PAGE_SIZE) || 1;
  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const paginatedEmployees = useMemo(() => {
    return filteredEmployees.slice(startIndex, startIndex + PAGE_SIZE);
  }, [filteredEmployees, startIndex]);

  const formatDate = (isoString) => {
    if (!isoString) return '—';
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  // ── Open Edit Modal ────────────────────────────────────────────────────────
  const openEditModal = (emp) => {
    setEditingEmployee(emp);
    setEditFormData({
      name: emp.name || '',
      email: emp.email || '',
      designation: emp.designation || '',
      department: emp.department || '',
    });
    setEditPhotos([null, null, null]);
    const initialPreviews = [
      emp.photos?.[0] ? getPhotoUrl(emp.photos[0]) : '',
      emp.photos?.[1] ? getPhotoUrl(emp.photos[1]) : '',
      emp.photos?.[2] ? getPhotoUrl(emp.photos[2]) : '',
    ];
    setEditPreviews(initialPreviews);
    setEditError('');
  };

  const handleEditPhotoSet = (index, file) => {
    const newPhotos = [...editPhotos];
    const newPreviews = [...editPreviews];

    // If previous was blob URL, revoke it
    if (newPreviews[index] && newPreviews[index].startsWith('blob:')) {
      URL.revokeObjectURL(newPreviews[index]);
    }

    newPhotos[index] = file;
    if (file) {
      newPreviews[index] = URL.createObjectURL(file);
    } else {
      // Revert to original or empty
      newPreviews[index] = '';
    }

    setEditPhotos(newPhotos);
    setEditPreviews(newPreviews);
  };

  const closeEditModal = () => {
    // Revoke object URLs created for edited photos
    editPreviews.forEach((p) => {
      if (p && p.startsWith('blob:')) {
        URL.revokeObjectURL(p);
      }
    });
    setEditingEmployee(null);
    setEditPhotos([null, null, null]);
    setEditPreviews(['', '', '']);
    setEditError('');
  };

  // ── Submit Edit Changes ────────────────────────────────────────────────────
  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editingEmployee) return;

    setIsSaving(true);
    setEditError('');

    try {
      const body = new FormData();
      body.append('name', editFormData.name.trim());
      body.append('email', editFormData.email.trim());
      body.append('designation', editFormData.designation.trim());
      body.append('department', editFormData.department.trim());

      // Append updated photos if any were changed
      editPhotos.forEach((file, idx) => {
        if (file) {
          body.append(`photo_${idx + 1}`, file);
        }
      });

      const res = await fetch(`${API}/api/employees/${editingEmployee.employee_id}/update`, {
        method: 'POST',
        body,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || data.message || 'Failed to update employee');
      }

      showToast('success', `Employee ${editingEmployee.name} updated successfully!`);
      closeEditModal();
      fetchEmployees();
    } catch (err) {
      console.error('Error updating employee:', err);
      setEditError(err.message || 'Error updating employee details');
    } finally {
      setIsSaving(false);
    }
  };

  // ── Delete Employee Action ────────────────────────────────────────────────
  const handleDeleteEmployee = async () => {
    if (!deletingEmployee) return;

    setIsDeleting(true);
    try {
      const res = await fetch(`${API}/api/employees/${deletingEmployee.employee_id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || data.message || 'Failed to delete employee');
      }

      showToast('success', `Employee ${deletingEmployee.name} (${deletingEmployee.employee_id}) deleted successfully.`);
      setDeletingEmployee(null);
      fetchEmployees();
    } catch (err) {
      console.error('Error deleting employee:', err);
      showToast('error', err.message || 'Could not delete employee');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification Banner */}
      {toast && (
        <div
          className={`fixed top-5 right-5 z-50 flex items-center gap-3 rounded-2xl px-5 py-3.5 shadow-2xl transition-all duration-300 ${toast.type === 'success'
            ? 'border border-emerald-200 bg-emerald-500 text-white'
            : 'border border-rose-200 bg-rose-500 text-white'
            }`}
        >
          {toast.type === 'success' ? (
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          )}
          <span className="text-xs font-semibold">{toast.message}</span>
          <button onClick={() => setToast(null)} className="ml-2 text-white/80 hover:text-white">
            ✕
          </button>
        </div>
      )}

      {/* Top Header & Stat Banner */}
      <div className="card-glass rounded-2xl border border-white/60 p-6 shadow-xl shadow-slate-200/50">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-[#c0392b] to-[#96281b] text-white shadow-md shadow-red-200">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                />
              </svg>
            </span>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-800 sm:text-2xl">
                Registered Employees Dashboard
              </h1>
              {/* <p className="text-xs text-slate-500">
                View 3-pose facial photos, edit employee information, re-capture photos with camera, or remove records.
              </p> */}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={fetchEmployees}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white/90 px-3.5 py-2 text-xs font-medium text-slate-700 shadow-sm transition-all hover:bg-slate-50 hover:border-slate-300 disabled:opacity-50"
              title="Refresh employee data"
            >
              <svg
                className={`h-4 w-4 ${loading ? 'animate-spin text-[#c0392b]' : 'text-slate-500'}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              Refresh
            </button>

            {/* <Link
              to="/register-alphabet"
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#c0392b] to-[#96281b] px-4 py-2 text-xs font-semibold text-white shadow-md shadow-red-200 transition-all hover:brightness-110"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Register New Employee
            </Link> */}
          </div>
        </div>

        {/* Total Registered Stat */}
        <div className="mt-5 flex flex-wrap gap-4">
          <div className="inline-flex items-center gap-4 rounded-xl border border-slate-100 bg-white/90 px-5 py-3.5 shadow-sm">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-50 text-[#c0392b]">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                />
              </svg>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Total Registered Employees</p>
              <p className="text-xl font-extrabold text-slate-900">{employees.length}</p>
            </div>
          </div>


        </div>
      </div>

      {/* Search Bar */}
      <div className="card-glass flex items-center gap-3 rounded-xl border border-white/60 px-4 py-3 shadow-md shadow-slate-200/40">
        <svg className="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <input
          type="text"
          placeholder="Search..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-transparent text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="text-xs font-medium text-slate-400 hover:text-slate-600"
          >
            Clear
          </button>
        )}
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="card-glass flex flex-col items-center justify-center rounded-2xl border border-white/60 py-20 text-center">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#c0392b] border-t-transparent" />
          <p className="mt-4 text-sm font-medium text-slate-500">Loading registered employees...</p>
        </div>
      ) : error ? (
        <div className="card-glass flex flex-col items-center justify-center rounded-2xl border border-red-200 bg-red-50/50 py-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-[#c0392b]">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="mt-3 text-base font-semibold text-slate-800">Failed to load employees</p>
          <p className="mt-1 text-xs text-slate-500">{error}</p>
          <button
            onClick={fetchEmployees}
            className="mt-4 rounded-xl bg-[#c0392b] px-4 py-2 text-xs font-semibold text-white shadow hover:brightness-110"
          >
            Try Again
          </button>
        </div>
      ) : filteredEmployees.length === 0 ? (
        <div className="card-glass flex flex-col items-center justify-center rounded-2xl border border-white/60 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
            <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <h3 className="mt-4 text-base font-bold text-slate-700">
            {search ? 'No matching employees found' : 'No employees registered yet'}
          </h3>
          <p className="mt-1 max-w-sm text-xs text-slate-500">
            {search
              ? `No registered employee matched "${search}".`
              : 'No records available.'}
          </p>
        </div>
      ) : (
        /* Employee Table Layout */
        <div className="card-glass overflow-hidden rounded-2xl border border-white/80 shadow-lg shadow-slate-200/50">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="border-b border-slate-200/80 bg-slate-50/80 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th scope="col" className="px-5 py-4 font-semibold"></th>
                  <th scope="col" className="px-5 py-4 font-semibold">Employee</th>
                  <th scope="col" className="px-5 py-4 font-semibold">Photos</th>
                  <th scope="col" className="px-5 py-4 font-semibold">Department</th>
                  <th scope="col" className="px-5 py-4 font-semibold">Designation</th>
                  <th scope="col" className="px-5 py-4 font-semibold">Registered</th>
                  <th scope="col" className="px-5 py-4 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white/60">
                {paginatedEmployees.map((emp, idx) => (
                  <tr
                    key={emp.id || emp.employee_id}
                    className="transition-colors hover:bg-red-50/30"
                  >
                    {/* Index */}
                    <td className="whitespace-nowrap px-5 py-4 text-xs font-medium text-slate-400">
                      {startIndex + idx + 1}
                    </td>

                    {/* Employee Name & ID */}
                    <td className="whitespace-nowrap px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-slate-800 to-slate-900 text-xs font-bold text-white shadow-sm">
                          {emp.name ? emp.name.charAt(0).toUpperCase() : 'E'}
                        </div>
                        <div>
                          <div className="font-semibold text-slate-900">{emp.name}</div>
                          <div className="text-xs text-slate-400">ID: <span className="font-mono font-medium text-slate-600">{emp.employee_id}</span></div>
                          {emp.email && <div className="text-[11px] text-slate-400">{emp.email}</div>}
                        </div>
                      </div>
                    </td>

                    {/* 3 Photos Thumbnails */}
                    <td className="whitespace-nowrap px-5 py-4">
                      <div className="flex items-center gap-2">
                        {[0, 1, 2].map((pIdx) => {
                          const rawUrl = emp.photos?.[pIdx];
                          const photoUrl = getPhotoUrl(rawUrl);
                          const pose = POSE_INFO[pIdx];

                          return (
                            <div key={pIdx} className="group relative">
                              {photoUrl ? (
                                <button
                                  type="button"
                                  onClick={() => setActiveLightbox({ employee: emp, photoIndex: pIdx })}
                                  className="relative block h-12 w-12 overflow-hidden rounded-xl border border-slate-200/80 bg-slate-100 shadow-sm transition-all duration-200 hover:scale-105 hover:border-red-400 hover:shadow-md"
                                  title={`Click to view ${pose.label}`}
                                >
                                  <img
                                    src={photoUrl}
                                    alt={`${emp.name} ${pose.label}`}
                                    className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-110"
                                    loading="lazy"
                                  />
                                  <span className="absolute bottom-0 inset-x-0 bg-black/60 py-0.5 text-center text-[9px] font-bold text-white uppercase tracking-tighter">
                                    {pose.short}
                                  </span>
                                </button>
                              ) : (
                                <div
                                  className="flex h-12 w-12 flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-slate-400"
                                  title={`No photo for ${pose.label}`}
                                >
                                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                  </svg>
                                  <span className="text-[9px] font-medium uppercase">{pose.short}</span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </td>

                    {/* Department */}
                    <td className="whitespace-nowrap px-5 py-4">
                      <span className="inline-flex items-center rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                        {emp.department || '—'}
                      </span>
                    </td>

                    {/* Designation */}
                    <td className="whitespace-nowrap px-5 py-4">
                      <span className="inline-flex items-center rounded-lg bg-red-50 px-2.5 py-1 text-xs font-semibold text-[#c0392b] ring-1 ring-inset ring-red-100">
                        {emp.designation || '—'}
                      </span>
                    </td>

                    {/* Registered Date */}
                    <td className="whitespace-nowrap px-5 py-4 text-xs text-slate-500">
                      <div className="flex items-center gap-1.5">
                        <svg className="h-3.5 w-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <span>{formatDate(emp.created_at)}</span>
                      </div>
                    </td>

                    {/* Actions: Edit & Delete */}
                    <td className="whitespace-nowrap px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {/* Edit Button */}
                        <button
                          type="button"
                          onClick={() => openEditModal(emp)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 hover:text-blue-600 hover:border-blue-200"
                          title="Edit employee details and photos"
                        >
                          <svg className="h-3.5 w-3.5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                          Edit
                        </button>

                        {/* Delete Button */}
                        <button
                          type="button"
                          onClick={() => setDeletingEmployee(emp)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-red-50 hover:text-red-600 hover:border-red-200"
                          title="Delete employee"
                        >
                          <svg className="h-3.5 w-3.5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Table Footer with Pagination */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-100 bg-slate-50/70 px-6 py-4 text-xs text-slate-500">
            <div>
              Showing{' '}
              <span className="font-semibold text-slate-800">
                {filteredEmployees.length === 0 ? 0 : startIndex + 1}
              </span>{' '}
              to{' '}
              <span className="font-semibold text-slate-800">
                {Math.min(startIndex + PAGE_SIZE, filteredEmployees.length)}
              </span>{' '}
              of <span className="font-semibold text-slate-800">{filteredEmployees.length}</span> records
            </div>

            {/* Pagination Controls */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                disabled={currentPage === 1}
                className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Previous
              </button>

              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={`min-w-[32px] rounded-lg px-2.5 py-1 text-xs font-semibold transition ${currentPage === page
                      ? 'bg-[#c0392b] text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-200/60'
                      }`}
                  >
                    {page}
                  </button>
                ))}
              </div>

              <button
                onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Photo Lightbox Modal ────────────────────────────────────────────── */}
      {activeLightbox && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-fade-in">
          <div className="relative max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            {/* Lightbox Header */}
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">{activeLightbox.employee.name}</h3>
                <p className="text-xs text-slate-500">
                  ID: <span className="font-mono font-medium">{activeLightbox.employee.employee_id}</span> • Pose: <span className="font-semibold text-[#c0392b]">{POSE_INFO[activeLightbox.photoIndex].label}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveLightbox(null)}
                className="rounded-full bg-slate-100 p-2 text-slate-500 transition hover:bg-slate-200 hover:text-slate-700"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Lightbox Main Image */}
            <div className="flex items-center justify-center bg-slate-950 p-4">
              {activeLightbox.employee.photos?.[activeLightbox.photoIndex] ? (
                <img
                  src={getPhotoUrl(activeLightbox.employee.photos[activeLightbox.photoIndex])}
                  alt={POSE_INFO[activeLightbox.photoIndex].label}
                  className="max-h-[60vh] w-auto rounded-lg object-contain shadow-md"
                />
              ) : (
                <div className="py-20 text-center text-slate-400 text-sm">No photo available for this pose</div>
              )}
            </div>

            {/* Lightbox Pose Switcher Tabs */}
            <div className="flex items-center justify-between bg-slate-50 px-6 py-3 border-t border-slate-100">
              <div className="flex items-center gap-2">
                {[0, 1, 2].map((pIdx) => (
                  <button
                    key={pIdx}
                    type="button"
                    onClick={() => setActiveLightbox({ ...activeLightbox, photoIndex: pIdx })}
                    className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${activeLightbox.photoIndex === pIdx
                      ? 'bg-[#c0392b] text-white shadow-sm'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                      }`}
                  >
                    {POSE_INFO[pIdx].label}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setActiveLightbox(null)}
                className="rounded-xl bg-slate-200 px-4 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-300"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation Modal ───────────────────────────────────────── */}
      {deletingEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-600">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">Delete Employee?</h3>
                <p className="text-xs text-slate-500">This action cannot be undone.</p>
              </div>
            </div>

            <p className="mt-4 text-xs text-slate-600 leading-relaxed">
              Are you sure you want to delete <span className="font-bold text-slate-800">{deletingEmployee.name}</span> (ID:{' '}
              <span className="font-mono font-semibold text-slate-800">{deletingEmployee.employee_id}</span>)?
            </p>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeletingEmployee(null)}
                disabled={isDeleting}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteEmployee}
                disabled={isDeleting}
                className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-red-200 transition hover:bg-red-700 disabled:opacity-50"
              >
                {isDeleting && (
                  <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                )}
                {isDeleting ? 'Deleting...' : 'Yes, Delete Employee'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Employee Modal ─────────────────────────────────────────────── */}
      {editingEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm overflow-y-auto">
          <div className="relative my-8 w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl border border-slate-100">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-6 py-4">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#c0392b] to-[#96281b] text-white shadow-sm">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </span>
                <div>
                  <h3 className="text-lg font-bold text-slate-800">Edit Employee Details</h3>
                  <p className="text-xs text-slate-500">
                    ID: <span className="font-mono font-semibold text-slate-700">{editingEmployee.employee_id}</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeEditModal}
                disabled={isSaving}
                className="rounded-full bg-white p-2 text-slate-400 border border-slate-200 transition hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Body / Form */}
            <form onSubmit={handleSaveEdit} className="p-6 space-y-6">
              {editError && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs text-red-700 flex items-start gap-2">
                  <svg className="h-4 w-4 shrink-0 text-red-500 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>{editError}</span>
                </div>
              )}

              {/* Basic Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Employee ID (Read-only) */}
                <div>
                  <label className="block mb-1.5 text-xs font-semibold text-slate-600">
                    Employee ID
                  </label>
                  <input
                    type="text"
                    value={editingEmployee.employee_id}
                    disabled
                    className="w-full rounded-xl border border-slate-200 bg-slate-100 px-3.5 py-2.5 text-xs font-mono font-semibold text-slate-600 cursor-not-allowed"
                  />
                </div>

                {/* Name */}
                <div>
                  <label className="block mb-1.5 text-xs font-semibold text-slate-600">
                    Full Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={editFormData.name}
                    onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                    className="input-field py-2 text-xs"
                    placeholder=""
                  />
                </div>

                {/* Email */}
                <div>
                  <label className="block mb-1.5 text-xs font-semibold text-slate-600">
                    Email Address <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    value={editFormData.email}
                    onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                    className="input-field py-2 text-xs"
                    placeholder=""
                  />
                </div>

                {/* Department */}
                <div>
                  <label className="block mb-1.5 text-xs font-semibold text-slate-600">
                    Department <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={editFormData.department}
                    onChange={(e) => setEditFormData({ ...editFormData, department: e.target.value })}
                    className="input-field py-2 text-xs"
                    placeholder=""
                  />
                </div>

                {/* Designation */}
                <div className="sm:col-span-2">
                  <label className="block mb-1.5 text-xs font-semibold text-slate-600">
                    Designation / Title <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={editFormData.designation}
                    onChange={(e) => setEditFormData({ ...editFormData, designation: e.target.value })}
                    className="input-field py-2 text-xs"
                    placeholder=""
                  />
                </div>
              </div>

              {/* 3 Photos Editor Section */}
              <div className="border-t border-slate-100 pt-5">
                <div className="mb-3">
                  <h4 className="text-sm font-bold text-slate-800">
                    Photos
                  </h4>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {[0, 1, 2].map((pIdx) => (
                    <div key={pIdx} className="rounded-xl border border-slate-100 bg-slate-50/50 p-2.5">
                      <PhotoSlot
                        index={pIdx}
                        preview={editPreviews[pIdx]}
                        onPhotoSet={handleEditPhotoSet}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Modal Footer Buttons */}
              <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={closeEditModal}
                  disabled={isSaving}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#c0392b] to-[#96281b] px-6 py-2.5 text-xs font-semibold text-white shadow-md shadow-red-200 transition hover:brightness-110 disabled:opacity-50"
                >
                  {isSaving && (
                    <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                  )}
                  {isSaving ? 'Saving Changes & Embeddings...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
