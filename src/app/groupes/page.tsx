'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/src/lib/supabaseClient'
import { useRouter } from 'next/navigation'

type Groupe = {
  id: string
  nom: string
  niveau?: string
  specialite?: string
}

export default function GroupesPage() {
  const [groupes, setGroupes] = useState<Groupe[]>([])
  const [editId, setEditId] = useState<string | null>(null)
  const router = useRouter()
  const [form, setForm] = useState({
    nom: '',
    niveau: '',
    specialite: '',
  });

  useEffect(() => {
    const fetchData = async () => {
      const { data: groupesData } = await supabase.from('groupes').select('*');
      if (groupesData) setGroupes(groupesData);
    };
    fetchData();
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer ce groupe ?')) return
    const { error } = await supabase.from('groupes').delete().eq('id', id)
    if (error) {
      alert('Erreur suppression : ' + error.message)
    } else {
      setGroupes(prev => prev.filter(g => g.id !== id))
    }
  }

  const handleEdit = (groupe: Groupe) => {
    setEditId(groupe.id)
    setForm({
      nom: groupe.nom,
      niveau: groupe.niveau || '',
      specialite: groupe.specialite || '',
    });
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = { nom: form.nom, niveau: form.niveau, specialite: form.specialite };

    if (editId) {
      const { error } = await supabase.from('groupes').update(payload).eq('id', editId);
      if (error) {
        alert('Erreur mise à jour : ' + error.message);
      } else {
        setGroupes(prev => prev.map(g => g.id === editId ? { ...g, ...payload } : g));
        setEditId(null);
        setForm({ nom: '', niveau: '', specialite: '' });
      }
    } else {
      const { data, error } = await supabase.from('groupes').insert([payload]).select();
      if (error) {
        alert('Erreur : ' + error.message);
      } else if (data && data.length > 0) {
        setGroupes(prev => [...prev, data[0]]);
        setForm({ nom: '', niveau: '', specialite: '' });
      }
    }
  };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Gestion des Groupes/Classes</h1>
      <button onClick={() => router.push('/')} className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600 mb-4">
        ⬅️ Retour à l'accueil
      </button>

      <form onSubmit={handleSubmit} className="space-y-4 mb-8">
        <input type="text" placeholder="Nom du groupe/classe" className="w-full border p-2 rounded" value={form.nom} onChange={e => setForm({ ...form, nom: e.target.value })} required />
        <input type="text" placeholder="Niveau (ex: L1, L2, M1)" className="w-full border p-2 rounded" value={form.niveau} onChange={e => setForm({ ...form, niveau: e.target.value })} />
        <input type="text" placeholder="Spécialité" className="w-full border p-2 rounded" value={form.specialite} onChange={e => setForm({ ...form, specialite: e.target.value })} />
        <button type="submit" className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700">
          {editId ? 'Mettre à jour' : 'Ajouter le groupe'}
        </button>
      </form>

      <table className="w-full border text-sm">
        <thead className="bg-gray-100">
          <tr>
            <th className="border px-2 py-1">Nom du groupe</th>
            <th className="border px-2 py-1">Niveau</th>
            <th className="border px-2 py-1">Spécialité</th>
            <th className="border px-2 py-1">Actions</th>
          </tr>
        </thead>
        <tbody>
          {groupes.map(g => (
            <tr key={g.id} className="text-center">
              <td className="border px-2 py-1">
                {g.nom} {g.niveau && `(${g.niveau})`} {g.specialite && `(${g.specialite})`}
              </td>
              <td className="border px-2 py-1">{g.niveau || '-'}</td>
              <td className="border px-2 py-1">{g.specialite || '-'}</td>
              <td className="border px-2 py-1 space-x-2">
                <button onClick={() => handleEdit(g)} className="text-blue-600 hover:underline">Modifier</button>
                <button onClick={() => handleDelete(g.id)} className="text-red-600 hover:underline">Supprimer</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
} 