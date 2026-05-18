import { useState } from 'react';
import { UserProfile } from '../types';

const EMOJI_OPTIONS = ['🧑', '👩', '👨', '👧', '👦', '🧓', '🙋', '🧑‍💼', '👩‍💻', '🧑‍🍳', '🦊', '🐼'];
const COLOR_OPTIONS = [
  '#3B82F6', // blue
  '#10B981', // emerald
  '#F59E0B', // amber
  '#EF4444', // red
  '#8B5CF6', // violet
  '#EC4899', // pink
  '#06B6D4', // cyan
  '#84CC16', // lime
];

interface Props {
  profiles: UserProfile[];
  onSelect: (id: string) => void;
  onCreateAndSelect: (profile: UserProfile) => void;
}

export default function ProfileSelector({ profiles, onSelect, onCreateAndSelect }: Props) {
  const [creating, setCreating] = useState(profiles.length === 0);
  const [name, setName]         = useState('');
  const [emoji, setEmoji]       = useState(EMOJI_OPTIONS[0]);
  const [color, setColor]       = useState(COLOR_OPTIONS[0]);

  const handleCreate = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const profile: UserProfile = {
      id: crypto.randomUUID(),
      name: trimmed,
      emoji,
      color,
    };
    onCreateAndSelect(profile);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-6 py-12">
      <img src="/spendora-logo.png" alt="Spendora" className="h-9 w-auto mb-3" />
      <p className="text-gray-400 text-sm mb-8">
        {creating ? 'Create your profile to get started' : 'Who\'s using the app?'}
      </p>

      {/* Existing profiles */}
      {!creating && (
        <div className="w-full max-w-sm space-y-3">
          {profiles.map((p) => (
            <button
              key={p.id}
              onClick={() => onSelect(p.id)}
              className="w-full flex items-center gap-4 bg-white rounded-2xl px-4 py-3 shadow-sm hover:shadow-md active:shadow-sm transition-shadow text-left"
            >
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center text-2xl shrink-0"
                style={{ backgroundColor: p.color + '22' }}
              >
                {p.emoji}
              </div>
              <div>
                <p className="font-semibold text-gray-800">{p.name}</p>
                <p className="text-xs text-gray-400">Tap to continue</p>
              </div>
              <div className="ml-auto text-gray-300 text-lg">›</div>
            </button>
          ))}

          <button
            onClick={() => setCreating(true)}
            className="w-full border-2 border-dashed border-gray-300 rounded-2xl py-3 text-sm text-gray-500 font-medium hover:border-blue-300 hover:text-blue-500 transition-colors"
          >
            + Add new profile
          </button>
        </div>
      )}

      {/* Create profile form */}
      {creating && (
        <div className="w-full max-w-sm space-y-5">
          {/* Preview */}
          <div className="flex justify-center">
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center text-4xl shadow-sm"
              style={{ backgroundColor: color + '33' }}
            >
              {emoji}
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Your name</label>
            <input
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              placeholder="e.g. Sarah"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              autoFocus
            />
          </div>

          {/* Emoji picker */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Avatar</label>
            <div className="grid grid-cols-6 gap-2">
              {EMOJI_OPTIONS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setEmoji(e)}
                  className={`text-2xl py-1.5 rounded-xl transition-colors ${
                    emoji === e ? 'bg-blue-100 ring-2 ring-blue-400' : 'hover:bg-gray-100'
                  }`}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>

          {/* Color picker */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Color</label>
            <div className="flex gap-2 flex-wrap">
              {COLOR_OPTIONS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-8 h-8 rounded-full transition-transform ${
                    color === c ? 'ring-2 ring-offset-2 ring-gray-400 scale-110' : 'hover:scale-105'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            {profiles.length > 0 && (
              <button
                type="button"
                onClick={() => setCreating(false)}
                className="flex-1 border border-gray-300 text-gray-600 py-3 rounded-xl text-sm font-medium hover:bg-gray-50"
              >
                Back
              </button>
            )}
            <button
              type="button"
              onClick={handleCreate}
              disabled={!name.trim()}
              className="flex-1 bg-blue-600 text-white py-3 rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Get Started
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
