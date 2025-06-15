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
    const [editingId, setEditingId] = useState<string | null>(null)

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

    // Soumission formulaire (ajout ou modification)
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        if (editingId) {
            const { error } = await supabase
                .from('salles')
                .update({ nom: form.nom, capacite: Number(form.capacite) })
                .eq('id', editingId)

            if (error) {
                alert('Erreur : ' + error.message)
            } else {
                alert('Salle modifiée avec succès !')
                setSalles(prev =>
                    prev.map(s =>
                        s.id === editingId
                            ? { ...s, nom: form.nom, capacite: Number(form.capacite) }
                            : s
                    )
                )
                setEditingId(null)
                setForm({ nom: '', capacite: '' })
            }
        } else {
            const { data, error } = await supabase.from('salles').insert([{
                nom: form.nom,
                capacite: Number(form.capacite)
            }])
            .select()

            if (error) {
                alert('Erreur : ' + error.message)
            } else if (data) {
                alert('Salle ajoutée avec succès !')
                setForm({ nom: '', capacite: '' })
                setSalles(prev => [...prev, ...data])
            }
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

    // Suppression
    const handleDelete = async (id: string) => {
        if (!confirm("Supprimer cette salle ?")) return
        const { error } = await supabase.from('salles').delete().eq('id', id)
        if (error) {
            alert("Erreur : " + error.message)
        } else {
            setSalles(prev => prev.filter(s => s.id !== id))
        }
    }

    // Préparation de l'édition
    const handleEdit = (salle: Salle) => {
        setForm({ nom: salle.nom, capacite: salle.capacite.toString() })
        setEditingId(salle.id)
    }

    return (
        <div className="p-6 max-w-3xl mx-auto">
            <h1 className="text-2xl font-bold mb-6">Gestion des Salles</h1>

            {/* Import Excel */}
            <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Importer un fichier Excel (.xlsx)</label>
                <input type="file" accept=".xlsx" onChange={handleImport} className="border p-2 rounded" />
            </div>

            {/* Formulaire */}
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
                    {editingId ? 'Modifier la salle' : 'Ajouter la salle'}
                </button>
                {editingId && (
                    <button
                        type="button"
                        onClick={() => {
                            setEditingId(null)
                            setForm({ nom: '', capacite: '' })
                        }}
                        className="ml-4 text-sm text-gray-600 underline"
                    >
                        Annuler
                    </button>
                )}
            </form>

            {/* Tableau des salles */}
            <table className="w-full border text-sm">
                <thead className="bg-gray-100">
                    <tr>
                        <th className="border px-2 py-1">Nom</th>
                        <th className="border px-2 py-1">Capacité</th>
                        <th className="border px-2 py-1">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {salles.map(salle => (
                        <tr key={salle.id} className="text-center">
                            <td className="border px-2 py-1">{salle.nom}</td>
                            <td className="border px-2 py-1">{salle.capacite}</td>
                            <td className="border px-2 py-1">
                                <button
                                    className="text-blue-600 hover:underline mr-2"
                                    onClick={() => handleEdit(salle)}
                                >
                                    Modifier
                                </button>
                                <button
                                    className="text-red-600 hover:underline"
                                    onClick={() => handleDelete(salle.id)}
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
