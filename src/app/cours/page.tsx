'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/src/lib/supabaseClient'
import * as XLSX from 'xlsx'
// Types
type Cours = {
  id: string
  nom: string
  enseignant_id: string
  enseignant_nom: string
}

type Enseignant = {
  id: string
  nom: string
}

export default function CoursPage() {
  const [cours, setCours] = useState<Cours[]>([])
  const [form, setForm] = useState({ nom: '', enseignant_id: '' })
  const [enseignants, setEnseignants] = useState<Enseignant[]>([])

useEffect(() => {
  const fetchData = async () => {
    const { data: enseignantsData } = await supabase
      .from('enseignants')
      .select('id, nom')

    const { data: coursData } = await supabase
      .from('cours')
      .select('id, nom, enseignant_id, enseignants (nom)')  // Jointure ici ✅

    if (enseignantsData) setEnseignants(enseignantsData)

    if (coursData) {
      const parsed = coursData.map((c: any) => ({
        id: c.id,
        nom: c.nom,
        enseignant_id: c.enseignant_id,
        enseignant_nom: c.enseignants?.nom || '',  // maintenant ça fonctionne ✅
      }))
      setCours(parsed)
    }
  }

  fetchData()
}, [])


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Vérifier s’il existe déjà un cours avec ce nom
    const { data: existingCours, error: checkError } = await supabase
      .from('cours')
      .select('id')
      .eq('nom', form.nom)

    if (checkError) {
      alert('Erreur lors de la vérification : ' + checkError.message)
      return
    }

    if (existingCours && existingCours.length > 0) {
      alert('Un cours avec ce nom existe déjà.')
      return
    }

    const { data, error } = await supabase
      .from('cours')
      .insert([{
        nom: form.nom,
        enseignant_id: form.enseignant_id,
      }])
      .select() // pour récupérer les données insérées

    if (error) {
      alert('Erreur : ' + error.message)
    } else if (data && data.length > 0) {
      const nouveauCours: Cours = {
        id: data[0].id,
        nom: data[0].nom,
        enseignant_id: data[0].enseignant_id,
        enseignant_nom: enseignants.find(e => e.id === form.enseignant_id)?.nom || ''
      }

      setCours(prev => [...prev, nouveauCours])
      setForm({ nom: '', enseignant_id: '' })
    }
  }

// ...dans handleImportCours...
//pour l'instant ok, mais à voir la contrainte unique du champs email dans la table enseignants
//soit obliger le user à créer d'abord les enseignants pour leur assigner ainsi l'email valide, soit laisser l'importer avec un email vide et donc sans contrainte unique
const handleImportCours = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = async (evt) => {
    const data = new Uint8Array(evt.target?.result as ArrayBuffer)
    const workbook = XLSX.read(data, { type: 'array' })
    const sheet = workbook.Sheets[workbook.SheetNames[0]]

    // Charger les enseignants depuis Supabase
    const { data: enseignants, error: errEns } = await supabase
      .from('enseignants')
      .select('id, nom')

    if (errEns || !enseignants) {
      alert("Erreur lors du chargement des enseignants.")
      return
    }

    // Utilitaire pour trouver la clé correspondante
    const findMatchingKey = (item: Record<string, any>, possibleKeys: string[]) => {
      return Object.keys(item).find(k =>
        possibleKeys.some(possible => k.includes(possible))
      )
    }

    // Nettoyage et parsing
    const jsonData = XLSX.utils.sheet_to_json(sheet, { defval: "" }) as any[]
    const coursToInsert: { nom: string; enseignant_id: string }[] = []
    const coursIgnorés: any[] = []

    for (const rawItem of jsonData) {
      const item = Object.fromEntries(
        Object.entries(rawItem).map(([k, v]) => [
          k.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim(),
          v
        ])
      )

      const nomKey = findMatchingKey(item, ['cours', 'nom du cours', 'nom'])
      const enseignantKey = findMatchingKey(item, ['enseignant', 'enseignants', 'nom de lenseignant', 'nom enseignant', 'prof', 'professeur'])

      const nom = nomKey ? item[nomKey] : null
      const enseignantNom = enseignantKey ? item[enseignantKey] : null

      if (!nom || !enseignantNom) continue

      const enseignant = enseignants.find(e =>
        e.nom.toLowerCase().trim() === String(enseignantNom).toLowerCase().trim()
      )

      if (enseignant) {
        coursToInsert.push({ nom: String(nom), enseignant_id: enseignant.id })
      } else {
        coursIgnorés.push(item)
      }
    }

    // 1. On insère d'abord les cours dont l'enseignant existe déjà
    if (coursToInsert.length > 0) {
      const { error } = await supabase
        .from('cours')
        .insert(coursToInsert)
        .select()

      if (error) {
        alert('Erreur lors de l’importation des cours : ' + error.message)
        return
      } else {
        alert('Importation des cours réussie (enseignants déjà répertoriés) !')
      }
    }

    // 2. On traite les cours ignorés (enseignants non trouvés)
    if (coursIgnorés.length > 0) {
      // Extraire les noms d'enseignants non trouvés (uniques)
      const enseignantsManquants = [
        ...new Set(
          coursIgnorés
            .map(item => {
              const enseignantKey = findMatchingKey(item, [
                'enseignant', 'enseignants', 'nom de lenseignant', 'nom enseignant', 'prof', 'professeur'
              ])
              return enseignantKey ? item[enseignantKey] : null
            })
            .filter(Boolean)
        ),
      ]

      const confirmAjout = window.confirm(
        `Les enseignants suivants ne sont pas répertoriés dans la base :\n\n${enseignantsManquants.join(
          '\n'
        )}\n\nVoulez-vous les ajouter et importer les cours associés ?`
      )

      if (confirmAjout) {
        // Ajouter les enseignants manquants
        const { data: newEns, error: errAjoutEns } = await supabase
          .from('enseignants')
          .insert(
            enseignantsManquants.map(nom => ({ nom: String(nom) }))
          )
          .select()

        if (errAjoutEns) {
          alert("Erreur lors de l'ajout des enseignants : " + errAjoutEns.message)
          return
        }

        // Recharger la liste des enseignants
        const { data: enseignantsMaj } = await supabase
          .from('enseignants')
          .select('id, nom')

        // Associer les cours ignorés aux nouveaux enseignants
        const coursToInsert2 = coursIgnorés
          .map(item => {
            const nomKey = findMatchingKey(item, ['cours', 'nom du cours', 'nom'])
            const enseignantKey = findMatchingKey(item, [
              'enseignant', 'enseignants', 'nom de lenseignant', 'nom enseignant', 'prof', 'professeur'
            ])
            const nom = nomKey ? item[nomKey] : null
            const enseignantNom = enseignantKey ? item[enseignantKey] : null
            if (!nom || !enseignantNom) return null
            const enseignant = enseignantsMaj?.find(
              e => e.nom.toLowerCase().trim() === String(enseignantNom).toLowerCase().trim()
            )
            if (!enseignant) return null
            return { nom: String(nom), enseignant_id: enseignant.id }
          })
          .filter(Boolean) as { nom: string; enseignant_id: string }[]

        if (coursToInsert2.length > 0) {
          const { error: errCours2 } = await supabase
            .from('cours')
            .insert(coursToInsert2)
            .select()
          if (errCours2) {
            alert("Erreur lors de l'ajout des cours ignorés : " + errCours2.message)
            return
          }
          alert('Importation des enseignants et des cours associés réussie !')
        }
      } else {
        alert('Aucun enseignant/cours ignoré n’a été ajouté.')
      }
    }

    // Recharge les cours avec la jointure sur les enseignants
    const { data: coursData } = await supabase
      .from('cours')
      .select('id, nom, enseignant_id, enseignants (nom)')

    if (coursData) {
      const parsed = coursData.map((c: any) => ({
        id: c.id,
        nom: c.nom,
        enseignant_id: c.enseignant_id,
        enseignant_nom: c.enseignants?.nom || '',
      }))
      setCours(parsed)
    }
  }

  reader.readAsArrayBuffer(file)
}





  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Gestion des Cours</h1>

      <form onSubmit={handleSubmit} className="space-y-4 mb-8">
        {/* Bouton Import */}
        <label className="block text-sm font-medium text-gray-700 mb-1">Importer un fichier Excel (.xlsx)</label>
        <input type="file" accept=".xlsx" onChange={handleImportCours} className="border p-2 rounded" />
        <input
          type="text"
          placeholder="Nom du cours"
          className="w-full border p-2 rounded"
          value={form.nom}
          onChange={e => setForm({ ...form, nom: e.target.value })}
          required
        />

        <select
          className="w-full border p-2 rounded"
          value={form.enseignant_id}
          onChange={e => setForm({ ...form, enseignant_id: e.target.value })}
          required
        >
          <option value="">Sélectionnez un enseignant</option>
          {enseignants.map(ens => (
            <option key={ens.id} value={ens.id}>{ens.nom}</option>
          ))}
        </select>

        <button type="submit" className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700">
          Ajouter le cours
        </button>


      </form>

      <table className="w-full border text-sm">
        <thead className="bg-gray-100">
          <tr>
            <th className="border px-2 py-1">Nom du cours</th>
            <th className="border px-2 py-1">Enseignant</th>
          </tr>
        </thead>
        <tbody>
          {cours.map(c => (
            <tr key={c.id} className="text-center">
              <td className="border px-2 py-1">{c.nom}</td>
              <td className="border px-2 py-1">{c.enseignant_nom}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
