'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/src/lib/supabaseClient'
import * as XLSX from 'xlsx'
import { useRouter } from 'next/navigation'


type Cours = {
  id: string
  nom: string
  enseignant_id: string
  enseignant_nom: string
  type: string
  niveau: string
  groupe_id?: string
  specialite?: string
}

type Enseignant = {
  id: string
  nom: string
}

type Groupe = {
  id: string
  nom: string
  niveau?: string
  specialite?: string
}

export default function CoursPage() {
  const [cours, setCours] = useState<Cours[]>([])
  const [enseignants, setEnseignants] = useState<Enseignant[]>([])
  const [groupes, setGroupes] = useState<Groupe[]>([])
  const [editId, setEditId] = useState<string | null>(null)
  const router = useRouter()
  const [formData, setFormData] = useState({
    nom: '',
    type: 'CM',
    duree: 1.5,
    niveau: 'L1',
    enseignant_id: '',
    salle_id: '',
    groupe_id: ''
  });


  useEffect(() => {
    const fetchData = async () => {
      const { data: coursData } = await supabase
        .from('cours')
        .select('id, nom, type, niveau, enseignant_id, groupe_id, enseignants (nom)')

      const { data: enseignantsData } = await supabase
        .from('enseignants')
        .select('id, nom')

      const { data: groupesData } = await supabase
        .from('groupes')
        .select('id, nom, niveau, specialite')

      console.log('=== DEBUG GROUPES ===');
      console.log('Groupes récupérés:', groupesData);

      if (coursData) {
        const parsed = coursData.map((c: any) => ({
          id: c.id,
          nom: c.nom,
          enseignant_id: c.enseignant_id,
          enseignant_nom: c.enseignants?.nom || '',
          type: c.type || '',
          niveau: c.niveau || 'L1',
          groupe_id: c.groupe_id,
        }))
        setCours(parsed)
      }

      if (enseignantsData) {
        setEnseignants(enseignantsData)
      }

      if (groupesData) {
        setGroupes(groupesData)
      }
    };

    fetchData();
  }, []);


  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer ce cours ?')) return

    const { error } = await supabase.from('cours').delete().eq('id', id)
    if (error) {
      alert('Erreur suppression : ' + error.message)
    } else {
      setCours(prev => prev.filter(c => c.id !== id))
    }
  }

  const handleEdit = (cours: Cours) => {
    setEditId(cours.id)
    setFormData({
      nom: cours.nom,
      type: cours.type,
      duree: 1.5,
      niveau: cours.niveau,
      enseignant_id: cours.enseignant_id,
      salle_id: '',
      groupe_id: cours.groupe_id || ''
    });
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const payload = {
      nom: formData.nom,
      enseignant_id: formData.enseignant_id,
      type: formData.type,
      niveau: formData.niveau,
      groupe_id: formData.groupe_id,
    };

    if (editId) {
      const { error } = await supabase.from('cours').update(payload).eq('id', editId);

      if (error) {
        alert('Erreur mise à jour : ' + error.message);
      } else {
        setCours(prev =>
          prev.map(c =>
            c.id === editId
              ? {
                ...c,
                ...payload,
                niveau: formData.niveau,
                enseignant_nom: enseignants.find(e => e.id === formData.enseignant_id)?.nom || '',
              }
              : c
          )
        );
        setEditId(null);
        setFormData({ nom: '', type: 'CM', duree: 1.5, niveau: 'L1', enseignant_id: '', salle_id: '', groupe_id: '' });
      }
    } else {
      const { data: existingCours, error: checkError } = await supabase
        .from('cours')
        .select('id')
        .eq('nom', formData.nom);

      if (checkError) {
        console.error('Erreur lors de la vérification:', checkError);
        return;
      }

      if (existingCours && existingCours.length > 0) {
        alert('Un cours avec ce nom existe déjà.');
        return;
      }

      const { data, error } = await supabase
        .from('cours')
        .insert([payload])
        .select();

      if (error) {
        console.error('Erreur lors de l\'ajout:', error);
      } else {
        const nouveauCours: Cours = {
          id: data[0].id,
          nom: data[0].nom,
          enseignant_id: data[0].enseignant_id,
          enseignant_nom: enseignants.find(e => e.id === formData.enseignant_id)?.nom || '',
          type: data[0].type,
          niveau: data[0].niveau || formData.niveau,
          groupe_id: data[0].groupe_id,
        };

        setCours(prev => [...prev, nouveauCours]);
        setFormData({ nom: '', type: 'CM', duree: 1.5, niveau: 'L1', enseignant_id: '', salle_id: '', groupe_id: '' });
      }
    }
  };

  const handleImportCours = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = async (evt) => {
      const data = new Uint8Array(evt.target?.result as ArrayBuffer)
      const workbook = XLSX.read(data, { type: 'array' })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]

      const { data: enseignants, error: errEns } = await supabase.from('enseignants').select('id, nom')
      if (errEns || !enseignants) {
        alert("Erreur lors du chargement des enseignants.")
        return
      }

      const findMatchingKey = (item: Record<string, any>, possibleKeys: string[]) =>
        Object.keys(item).find(k => possibleKeys.some(possible => k.toLowerCase().includes(possible)))

      const jsonData = XLSX.utils.sheet_to_json(sheet, { defval: "" }) as any[]
      const coursToInsert: { nom: string; enseignant_id: string; type: string }[] = []
      const coursIgnorés: any[] = []

      for (const rawItem of jsonData) {
        const item = Object.fromEntries(
          Object.entries(rawItem).map(([k, v]) => [
            k.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim(),
            v
          ])
        )

        const nomKey = findMatchingKey(item, ['cours', 'nom du cours', 'nom'])
        const enseignantKey = findMatchingKey(item, ['enseignant', 'enseignants', 'prof'])
        const typeKey = findMatchingKey(item, ['type', 'type de cours', 'nature'])
        const type = typeKey ? item[typeKey] : 'Cours'
        const nom = nomKey ? item[nomKey] : null
        const enseignantNom = enseignantKey ? item[enseignantKey] : null

        if (!nom || !enseignantNom) continue

        const enseignant = enseignants.find(e =>
          e.nom.toLowerCase().trim() === String(enseignantNom).toLowerCase().trim()
        )

        if (enseignant) {
          coursToInsert.push({ nom: String(nom), enseignant_id: enseignant.id, type: String(type) })
        } else {
          coursIgnorés.push(item)
        }
      }

      const { data: existingCours, error: existingErr } = await supabase.from('cours').select('nom')
      if (existingErr) {
        alert("Erreur lors de la vérification des cours existants : " + existingErr.message)
        return
      }

      const nomsExistants = existingCours?.map(c => c.nom.toLowerCase().trim()) || []
      const coursFiltres = coursToInsert.filter(c =>
        !nomsExistants.includes(c.nom.toLowerCase().trim())
      )

      if (coursFiltres.length > 0) {
        await supabase.from('cours').insert(coursFiltres).select()
      }

      if (coursIgnorés.length > 0) {
        const enseignantsManquants = [...new Set(
          coursIgnorés.map(item => {
            const enseignantKey = findMatchingKey(item, ['enseignant', 'prof'])
            return enseignantKey ? item[enseignantKey] : null
          }).filter(Boolean)
        )]

        const confirmAjout = window.confirm(
          `Les enseignants suivants ne sont pas dans la base :\n${enseignantsManquants.join('\n')}\nVoulez-vous les ajouter ?`
        )

        if (confirmAjout) {
          const enseignantsExistants = enseignants.map(e => e.nom.toLowerCase().trim())

          const nouveauxEnseignants = enseignantsManquants
            .map(nom => String(nom).trim())
            .filter(nom => !enseignantsExistants.includes(nom.toLowerCase()))

          if (nouveauxEnseignants.length > 0) {
            await supabase
              .from('enseignants')
              .insert(nouveauxEnseignants.map(nom => ({ nom })))
              .select()
          }
        }
      }

      const { data: coursData } = await supabase
        .from('cours')
        .select('id, nom, type, enseignant_id, enseignants (nom)')

      if (coursData) {
        const parsed = coursData.map((c: any) => ({
          id: c.id,
          nom: c.nom,
          enseignant_id: c.enseignant_id,
          enseignant_nom: c.enseignants?.nom || '',
          type: c.type || '',
          niveau: c.niveau || 'L1',
        }))
        setCours(parsed)
      }
    }

    reader.readAsArrayBuffer(file)
  }

  const handleImportTemplate = async (niveau: string, specialite: string) => {
    if (!confirm(`Importer les cours template pour ${niveau} - ${specialite} ?`)) return;

    let templates: Array<{ nom: string; type: string; niveau: string }> = [];
    
    if (niveau === 'L1' && specialite === 'Informatique') {
      templates = [
        { nom: 'Programmation Python', type: 'CM', niveau: 'L1' },
        { nom: 'Mathématiques', type: 'CM', niveau: 'L1' },
        { nom: 'Anglais', type: 'CM', niveau: 'L1' },
        { nom: 'Algorithmes', type: 'TD', niveau: 'L1' },
        { nom: 'Base de données', type: 'TP', niveau: 'L1' }
      ];
    } else if (niveau === 'L1' && specialite === 'Économie') {
      templates = [
        { nom: 'Microéconomie', type: 'CM', niveau: 'L1' },
        { nom: 'Macroéconomie', type: 'CM', niveau: 'L1' },
        { nom: 'Mathématiques', type: 'CM', niveau: 'L1' },
        { nom: 'Statistiques', type: 'TD', niveau: 'L1' },
        { nom: 'Anglais', type: 'CM', niveau: 'L1' }
      ];
    } else if (niveau === 'L2' && specialite === 'Informatique') {
      templates = [
        { nom: 'Base de données avancées', type: 'CM', niveau: 'L2' },
        { nom: 'Algorithmes avancés', type: 'CM', niveau: 'L2' },
        { nom: 'Réseaux', type: 'CM', niveau: 'L2' },
        { nom: 'Programmation web', type: 'TP', niveau: 'L2' },
        { nom: 'Anglais technique', type: 'CM', niveau: 'L2' }
      ];
    } else if (niveau === 'L2' && specialite === 'Économie') {
      templates = [
        { nom: 'Économétrie', type: 'CM', niveau: 'L2' },
        { nom: 'Finance', type: 'CM', niveau: 'L2' },
        { nom: 'Marketing', type: 'CM', niveau: 'L2' },
        { nom: 'Statistiques avancées', type: 'TD', niveau: 'L2' },
        { nom: 'Anglais des affaires', type: 'CM', niveau: 'L2' }
      ];
    }
    
    for (const template of templates) {
      // Vérifier si le cours existe déjà
      const { data: existing } = await supabase
        .from('cours')
        .select('id')
        .eq('nom', template.nom)
        .eq('niveau', template.niveau);

      if (!existing || existing.length === 0) {
        // Créer le cours
        await supabase
          .from('cours')
          .insert([{
            nom: template.nom,
            type: template.type,
            niveau: template.niveau,
            enseignant_id: '', // À assigner manuellement
            groupe_id: '' // À assigner manuellement
          }]);
      }
    }

    // Recharger les données
    const { data: coursData } = await supabase
      .from('cours')
      .select('id, nom, type, niveau, enseignant_id, groupe_id, enseignants (nom)')

    if (coursData) {
      const parsed = coursData.map((c: any) => ({
        id: c.id,
        nom: c.nom,
        enseignant_id: c.enseignant_id,
        enseignant_nom: c.enseignants?.nom || '',
        type: c.type || '',
        niveau: c.niveau || 'L1',
        groupe_id: c.groupe_id,
      }))
      setCours(parsed)
    }
    
    alert(`Template ${niveau} - ${specialite} importé avec succès !`);
  };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Gestion des Cours</h1>
      <button
        onClick={() => router.push('/')}
        className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600"
      >
        ⬅️ Retour à l'accueil
      </button>
      <form onSubmit={handleSubmit} className="space-y-4 mb-8">
        <label className="block text-sm font-medium text-gray-700 mb-1">Importer un fichier Excel (.xlsx)</label>
        <input type="file" accept=".xlsx" onChange={handleImportCours} className="border p-2 rounded" />

        <input
          type="text"
          placeholder="Nom du cours"
          className="w-full border p-2 rounded"
          value={formData.nom}
          onChange={e => setFormData({ ...formData, nom: e.target.value })}
          required
        />

        <select
          className="w-full border p-2 rounded"
          value={formData.enseignant_id}
          onChange={e => setFormData({ ...formData, enseignant_id: e.target.value })}
          required
        >
          <option value="">Sélectionnez un enseignant</option>
          {enseignants.map(ens => (
            <option key={ens.id} value={ens.id}>{ens.nom}</option>
          ))}
        </select>

        <select
          className="w-full border p-2 rounded"
          value={formData.type}
          onChange={e => setFormData({ ...formData, type: e.target.value })}
          required
        >
          <option value="">Type de cours</option>
          <option value="Cours">Cours</option>
          <option value="TD">TD</option>
          <option value="TP">TP</option>
        </select>

        <select
          className="w-full border p-2 rounded"
          value={formData.niveau}
          onChange={e => setFormData({ ...formData, niveau: e.target.value })}
          required
        >
          <option value="">Niveau</option>
          <option value="L1">L1 (1ère année)</option>
          <option value="L2">L2 (2ème année)</option>
          <option value="L3">L3 (3ème année)</option>
          <option value="M1">M1 (Master 1)</option>
          <option value="M2">M2 (Master 2)</option>
        </select>

        <select
          className="w-full border p-2 rounded"
          value={formData.groupe_id}
          onChange={e => setFormData({ ...formData, groupe_id: e.target.value })}
        >
          <option value="">Sélectionnez un groupe (optionnel)</option>
          {groupes.map(groupe => (
            <option key={groupe.id} value={groupe.id}>
              {groupe.nom} {groupe.niveau && `(${groupe.niveau})`} {groupe.specialite && `(${groupe.specialite})`}
            </option>
          ))}
        </select>

        <button type="submit" className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700">
          {editId ? 'Mettre à jour' : 'Ajouter le cours'}
        </button>
      </form>

      <table className="w-full border text-sm">
        <thead className="bg-gray-100">
          <tr>
            <th className="border px-2 py-1">Nom du cours</th>
            <th className="border px-2 py-1">Enseignant</th>
            <th className="border px-2 py-1">Type</th>
            <th className="border px-2 py-1">Niveau</th>
            <th className="border px-2 py-1">Groupe</th>
            <th className="border px-2 py-1">Actions</th>
          </tr>
        </thead>
        <tbody>
          {cours.map(c => (
            <tr key={c.id} className="text-center">
              <td className="border px-2 py-1">{c.nom}</td>
              <td className="border px-2 py-1">{c.enseignant_nom}</td>
              <td className="border px-2 py-1">{c.type}</td>
              <td className="border px-2 py-1">{c.niveau}</td>
              <td className="border px-2 py-1">
                {(() => {
                  const groupe = groupes.find(g => g.id === c.groupe_id);
                  if (!groupe) return '-';
                  return `${groupe.nom} ${groupe.niveau ? `(${groupe.niveau})` : ''} ${groupe.specialite ? `(${groupe.specialite})` : ''}`;
                })()}
              </td>
              <td className="border px-2 py-1 space-x-2">
                <button
                  onClick={() => handleEdit(c)}
                  className="text-blue-600 hover:underline"
                >
                  Modifier
                </button>
                <button
                  onClick={() => handleDelete(c.id)}
                  className="text-red-600 hover:underline"
                >
                  Supprimer
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
