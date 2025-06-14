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
      const { data: enseignantsData } = await supabase.from('enseignants').select('id, nom')
      const { data: coursData } = await supabase
        .from('cours')
        .select('id, nom, enseignant_id, enseignant (nom)')

      if (enseignantsData) setEnseignants(enseignantsData)

      if (coursData) {
        const parsed = coursData.map((c: any) => ({
          id: c.id,
          nom: c.nom,
          enseignant_id: c.enseignant_id,
          enseignant_nom: c.enseignant?.nom || '',
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

  // Import Excel (.xlsx)
  const handleImportCours = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = async (evt) => {
      const data = new Uint8Array(evt.target?.result as ArrayBuffer)
      const workbook = XLSX.read(data, { type: 'array' })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const jsonData = XLSX.utils.sheet_to_json(sheet)

      // Charger les enseignants depuis Supabase
      const { data: enseignants, error: errEns } = await supabase.from('enseignants').select('id, nom')
      if (errEns || !enseignants) {
        alert("Erreur lors du chargement des enseignants.")
        return
      }

      const coursToInsert: { nom: string; enseignant_id: string }[] = []
      const coursIgnorés: any[] = []

      for (const item of jsonData as any[]) {
        const nom = item.nom || item.Nom
        const enseignantNom = item.enseignant || item.Enseignant

        if (!nom || !enseignantNom) continue

        const enseignant = enseignants?.find(e => e.nom === enseignantNom)
        console.log("enseignantExcel:", enseignantNom, "-> trouvé dans Supabase:", enseignant?.id || "non trouvé")


        if (enseignant) {
          coursToInsert.push({ nom, enseignant_id: enseignant.id })
        } else {
          coursIgnorés.push(item)
        }
      }

      if (coursToInsert.length === 0) {
        alert('Aucun cours valide trouvé dans le fichier.')
        console.warn('Cours ignorés (enseignants non trouvés) :', coursIgnorés)
        return
      }

      const { error } = await supabase
        .from('cours')
        .insert(coursToInsert)
        .select()

      if (error) {
        alert('Erreur lors de l’importation des cours : ' + error.message)
      } else {
        alert('Importation des cours réussie !')

        // Recharge tous les cours depuis la base
        const { data: coursData } = await supabase
          .from('cours')
          .select('id, nom, enseignant_id, enseignant (nom)')

        if (coursData) {
          const parsed = coursData.map((c: any) => ({
            id: c.id,
            nom: c.nom,
            enseignant_id: c.enseignant_id,
            enseignant_nom: c.enseignant?.nom || '',
          }))
          setCours(parsed)
        }
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
