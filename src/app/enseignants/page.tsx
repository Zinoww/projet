'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/src/lib/supabaseClient'
import * as XLSX from 'xlsx'

type Enseignant = {
    id: string
    nom: string
    email: string
    heures_travail: number
}

export default function EnseignantsPage() {
    const [enseignants, setEnseignants] = useState<Enseignant[]>([])
    const [form, setForm] = useState({ nom: '', email: '', heures_travail: '' })
    const [editingId, setEditingId] = useState<string | null>(null)

    const [cours, setCours] = useState<any[]>([])

    useEffect(() => {
        fetchEnseignants()
    }, [])

    const fetchEnseignants = async () => {
        const { data, error } = await supabase.from('enseignants').select('*')
        if (error) {
            console.error('Erreur chargement des enseignants :', error.message)
        } else if (data) {
            setEnseignants(data as Enseignant[])
        }
    }
    const fetchCours = async () => {
        const { data, error } = await supabase.from('cours').select('*')
        if (error) {
            console.error("Erreur lors du chargement des cours :", error.message)
        } else if (data) {
            setCours(data) // ou setState approprié si tu veux les stocker
        }
    }



    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        // Vérifier si un cours avec le même nom existe déjà
        const { data: existing, error: checkError } = await supabase
            .from('cours')
            .select('id')
            .eq('nom', form.nom)

        if (checkError) {
            alert("Erreur lors de la vérification : " + checkError.message)
            return
        }

        // Cas 1 : Ajout - bloquer si un cours avec le même nom existe déjà
        if (!editingId && existing && existing.length > 0) {
            alert("Un cours avec ce nom existe déjà.")
            return
        }

        // Cas 2 : Modification - bloquer si un autre cours porte déjà ce nom
        if (
            editingId &&
            existing &&
            existing.length > 0 &&
            existing[0].id !== editingId
        ) {
            alert("Un autre cours avec ce nom existe déjà.")
            return
        }

        if (editingId) {
            const { error } = await supabase.from('enseignants').update({
                nom: form.nom,
                email: form.email,
                heures_travail: Number(form.heures_travail)
            }).eq('id', editingId)

            if (error) {
                alert('Erreur : ' + error.message)
                return
            }

            setEditingId(null)
        } else {
            const { error } = await supabase.from('enseignants').insert([{
                nom: form.nom,
                email: form.email,
                heures_travail: Number(form.heures_travail)
            }])

            if (error) {
                alert('Erreur : ' + error.message)
                return
            }
        }

        setForm({ nom: '', email: '', heures_travail: '' })
        fetchCours() // assure-toi que cette fonction est bien définie pour recharger les données
    }




    const handleEdit = (enseignant: Enseignant) => {
        setEditingId(enseignant.id)
        setForm({
            nom: enseignant.nom,
            email: enseignant.email,
            heures_travail: enseignant.heures_travail !== null && enseignant.heures_travail !== undefined
                ? enseignant.heures_travail.toString()
                : ''
        })
    }

    const handleDelete = async (id: string) => {
        if (!confirm('Confirmer la suppression ?')) return

        const { error } = await supabase.from('enseignants').delete().eq('id', id)
        if (error) alert('Erreur : ' + error.message)
        fetchEnseignants()
    }
    const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        const reader = new FileReader()
        reader.onload = async (evt) => {
            const data = new Uint8Array(evt.target?.result as ArrayBuffer)
            const workbook = XLSX.read(data, { type: 'array' })
            const sheet = workbook.Sheets[workbook.SheetNames[0]]
            const jsonData = XLSX.utils.sheet_to_json(sheet)

            const enseignantsToInsert = (jsonData as any[]).map(item => ({
                nom: item.nom || item.Nom || '',
                email: item.email || item.Email || '',
                heures_travail: Number(item.heures_travail || item.Heures || 0)
            })).filter(e => e.nom && e.email)

            if (enseignantsToInsert.length === 0) {
                alert('Aucun enseignant valide trouvé dans le fichier.')
                return
            }

            const { data: inserted, error } = await supabase.from('enseignants').insert(enseignantsToInsert)

            if (error) {
                alert('Erreur lors de l’importation : ' + error.message)
            } else if (inserted) {
                alert('Importation des enseignants réussie !')
                setEnseignants(prev => [...prev, ...inserted])
            }
        }

        reader.readAsArrayBuffer(file)
    }


    return (
        <div className="p-6 max-w-3xl mx-auto">
            <h1 className="text-2xl font-bold mb-6">Gestion des Enseignants</h1>

            {/* Formulaire */}
            <form onSubmit={handleSubmit} className="space-y-4 mb-8">

                {/* Bouton Import */}
                <label className="block text-sm font-medium text-gray-700 mb-1">Importer un fichier Excel (.xlsx)</label>
                <input type="file" accept=".xlsx" onChange={handleImport} className="border p-2 rounded" />
                <input
                    type="text"
                    placeholder="Nom"
                    className="w-full border p-2 rounded"
                    value={form.nom}
                    onChange={e => setForm({ ...form, nom: e.target.value })}
                    required
                />
                <input
                    type="email"
                    placeholder="Email"
                    className="w-full border p-2 rounded"
                    value={form.email}
                    onChange={e => setForm({ ...form, email: e.target.value })}
                    required
                />
                <input
                    type="number"
                    placeholder="Heures de travail"
                    className="w-full border p-2 rounded"
                    value={form.heures_travail}
                    onChange={e => setForm({ ...form, heures_travail: e.target.value })}
                    required
                />
                <button
                    type="submit"
                    className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
                >
                    {editingId ? 'Modifier' : 'Ajouter'}
                </button>

            </form>

            {/* Tableau */}
            <table className="w-full border text-sm">
                <thead className="bg-gray-100">
                    <tr>
                        <th className="border px-2 py-1">Nom</th>
                        <th className="border px-2 py-1">Email</th>
                        <th className="border px-2 py-1">Heures</th>
                        <th className="border px-2 py-1">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {enseignants.map(ens => (
                        <tr key={ens.id} className="text-center">
                            <td className="border px-2 py-1">{ens.nom}</td>
                            <td className="border px-2 py-1">{ens.email}</td>
                            <td className="border px-2 py-1">{ens.heures_travail}</td>
                            <td className="border px-2 py-1 space-x-2">
                                <button
                                    onClick={() => handleEdit(ens)}
                                    className="bg-yellow-400 text-white px-2 py-1 rounded"
                                >
                                    Modifier
                                </button>
                                <button
                                    onClick={() => handleDelete(ens.id)}
                                    className="bg-red-600 text-white px-2 py-1 rounded"
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
