'use client';

import { useEffect, useState } from 'react';
import { Camera, Image as ImageIcon } from 'lucide-react';

interface Photo {
  id: string;
  url: string;
  type: string;
  caption: string | null;
  created_at: string;
  job: {
    id: string;
    address: string;
    customer: { id: string; name: string };
  };
}

const TYPE_COLORS: Record<string, string> = {
  general:  'bg-gray-700 text-gray-300',
  before:   'bg-blue-900 text-blue-300',
  after:    'bg-green-900 text-green-300',
  damage:   'bg-red-900 text-red-300',
  material: 'bg-purple-900 text-purple-300',
};

export default function PhotosPage() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [lightbox, setLightbox] = useState<Photo | null>(null);

  const load = async () => {
    setLoading(true);
    const res = await fetch('/api/admin/photos');
    const data = await res.json();
    setPhotos(data.photos || []);
    setTotal(data.total || 0);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = typeFilter === 'ALL' ? photos : photos.filter(p => p.type === typeFilter);
  const types = ['ALL', ...Array.from(new Set(photos.map(p => p.type)))];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Job Photos</h1>
          <p className="text-gray-400 text-sm mt-1">{total} photos across all jobs</p>
        </div>
      </div>

      {/* Type filter */}
      <div className="flex gap-1.5 flex-wrap mb-6">
        {types.map(t => (
          <button key={t} onClick={() => setTypeFilter(t)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors ${
              typeFilter === t ? 'bg-red-700 text-white' : 'bg-gray-800 text-gray-400 border border-gray-700 hover:text-white'
            }`}>
            {t}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {[...Array(20)].map((_, i) => (
            <div key={i} className="aspect-square bg-gray-800 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-16 text-center">
          <Camera className="w-12 h-12 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400">No photos yet. Photos will appear here when added to jobs.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {filtered.map(photo => (
            <div key={photo.id} onClick={() => setLightbox(photo)}
              className="group relative aspect-square bg-gray-800 rounded-xl overflow-hidden cursor-pointer border border-gray-700 hover:border-gray-500 transition-colors">
              <img src={photo.url} alt={photo.caption || 'Job photo'}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-3 flex flex-col justify-end">
                <div className="text-white text-xs font-medium truncate">{photo.job.customer.name}</div>
                <div className="text-gray-300 text-xs truncate">{photo.job.address}</div>
                {photo.caption && <div className="text-gray-400 text-xs italic truncate">{photo.caption}</div>}
              </div>
              <div className="absolute top-2 right-2">
                <span className={`text-xs px-1.5 py-0.5 rounded font-semibold capitalize ${TYPE_COLORS[photo.type] || TYPE_COLORS.general}`}>
                  {photo.type}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}>
          <div className="max-w-4xl max-h-full" onClick={e => e.stopPropagation()}>
            <img src={lightbox.url} alt={lightbox.caption || 'Job photo'}
              className="max-w-full max-h-[80vh] object-contain rounded-xl" />
            <div className="mt-3 text-center">
              <div className="font-semibold text-white">{lightbox.job.customer.name}</div>
              <div className="text-gray-400 text-sm">{lightbox.job.address}</div>
              {lightbox.caption && <div className="text-gray-500 text-sm italic mt-1">{lightbox.caption}</div>}
              <button onClick={() => setLightbox(null)}
                className="mt-4 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm rounded-lg">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
