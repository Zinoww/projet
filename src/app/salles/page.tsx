'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/src/lib/supabaseClient'
import * as XLSX from 'xlsx'

type Salle = {
    id: string
    nom: string
    capacite: number
}

export default function SallesPage() {
    const [salles, setSalles] = useState<Salle[]>([])
    const [form, setForm] = useState({ nom: '', capacite: '' })

    // Chargement des salles
    useEffect(() => {
        const fetchSalles = async () => {
            const { data, error } = await supabase.from('salles').select('*')
            if (error) {
                console.error('Erreur chargement des salles :', error.message)
            } else if (data) {
                setSalles(data as Salle[])
            }
        }
        fetchSalles()
    }, [])

    // Ajout manuel
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        const { data, error } = await supabase.from('salles').insert([{
            nom: form.nom,
            capacite: Number(form.capacite)
        }])

        if (error) {
            alert('Erreur : ' + error.message)
        } else if (data) {
            setForm({ nom: '', capacite: '' })
            setSalles(prev => [...prev, ...data])
        }
    }

    // Import Excel (.xlsx)
    const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        const reader = new FileReader()
        reader.onload = async (evt) => {
            const data = new Uint8Array(evt.target?.result as ArrayBuffer)
            const workbook = XLSX.read(data, { type: 'array' })
            const sheet = workbook.Sheets[workbook.SheetNames[0]]
            const jsonData = XLSX.utils.sheet_to_json(sheet)

            // Conversion en tableau de salles
            const sallesToInsert = (jsonData as any[]).map(item => ({
                nom: item.nom || item.Nom || '',
                capacite: Number(item.capacite || item.Capacité || 0)
            })).filter(salle => salle.nom && salle.capacite)

            if (sallesToInsert.length === 0) {
                alert('Aucune salle valide trouvée dans le fichier.')
                return
            }

            const { data: inserted, error } = await supabase.from('salles').insert(sallesToInsert)

            if (error) {
                alert('Erreur lors de l’importation : ' + error.message)
            } else if (inserted) {
                alert('Importation réussie !')
                setSalles(prev => [...prev, ...inserted])
            }
        }

        reader.readAsArrayBuffer(file)
    }

    return (
        <div className="p-6 max-w-3xl mx-auto">
            <h1 className="text-2xl font-bold mb-6">Gestion des Salles</h1>

            {/* Bouton Import */}
            <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Importer un fichier Excel (.xlsx)</label>
                <input type="file" accept=".xlsx" onChange={handleImport} className="border p-2 rounded" />
            </div>

            {/* Formulaire manuel */}
            <form onSubmit={handleSubmit} className="space-y-4 mb-8">
                <input
                    type="text"
                    placeholder="Nom de la salle"
                    className="w-full border p-2 rounded"
                    value={form.nom}
                    onChange={e => setForm({ ...form, nom: e.target.value })}
                    required
                />
                <input
                    type="number"
                    placeholder="Capacité"
                    className="w-full border p-2 rounded"
                    value={form.capacite}
                    onChange={e => setForm({ ...form, capacite: e.target.value })}
                    required
                />
                <button type="submit" className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700">
                    Ajouter la salle
                </button>
            </form>

            {/* Tableau des salles */}
            <table className="w-full border text-sm">
                <thead className="bg-gray-100">
                    <tr>
                        <th className="border px-2 py-1">Nom</th>
                        <th className="border px-2 py-1">Capacité</th>
                    </tr>
                </thead>
                <tbody>
                    {salles.map(salle => (
                        <tr key={salle.id} className="text-center">
                            <td className="border px-2 py-1">{salle.nom}</td>
                            <td className="border px-2 py-1">{salle.capacite}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}
