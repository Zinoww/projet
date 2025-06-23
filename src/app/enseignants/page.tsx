'use client'

import { useState, useEffect, FormEvent, ChangeEvent } from 'react'
import { supabase } from '@/src/lib/supabaseClient'
import Link from 'next/link'
import { FaChalkboardTeacher, FaPlus, FaTrash, FaPencilAlt, FaArrowLeft, FaFileExcel } from 'react-icons/fa'
import * as XLSX from 'xlsx'

interface Enseignant {
    id: string
    nom: string | null
    email: string
    heures_travail: string | null
}

interface ExcelRow {
    nom: string;
    email: string;
    heures_travail?: string;
}

export default function EnseignantsPage() {
    const [enseignants, setEnseignants] = useState<Enseignant[]>([])
    const [newEnseignant, setNewEnseignant] = useState({ nom: '', email: '', heures_travail: '' })
    const [editingEnseignant, setEditingEnseignant] = useState<Enseignant | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        fetchEnseignants()
    }, [])

    const fetchEnseignants = async () => {
        setLoading(true)
        const { data, error } = await supabase.from('enseignants').select('*').order('nom', { ascending: true })
        if (error) {
            console.error('Erreur de chargement:', error)
            setError('Impossible de charger les enseignants.')
        } else {
            setEnseignants(data)
            setError(null)
        }
        setLoading(false)
    }

    const handleAddEnseignant = async (e: FormEvent) => {
        e.preventDefault()
        if (!newEnseignant.nom.trim() || !newEnseignant.email.trim()) {
            setError('Le nom et l\'email sont obligatoires.')
            return
        }

        const { data, error } = await supabase.from('enseignants').insert([{
            nom: newEnseignant.nom.trim(),
            email: newEnseignant.email.trim(),
            heures_travail: newEnseignant.heures_travail.trim() || null
        }]).select()
        
        if (error) {
            console.error('Erreur ajout:', error)
            setError('Erreur lors de l\'ajout de l\'enseignant.')
        } else if (data) {
            setEnseignants([...enseignants, ...data])
            setNewEnseignant({ nom: '', email: '', heures_travail: '' })
            setError(null)
        }
    }
    
    const handleDeleteEnseignant = async (id: string) => {
        if (!confirm('Êtes-vous sûr de vouloir supprimer cet enseignant ?')) return

        const { error } = await supabase.from('enseignants').delete().eq('id', id)
            if (error) {
            console.error('Erreur suppression:', error)
            setError('Impossible de supprimer cet enseignant.')
        } else {
            setEnseignants(enseignants.filter((e) => e.id !== id))
            setError(null)
        }
    }

    const handleUpdateEnseignant = async (e: FormEvent) => {
        e.preventDefault()
        if (
            !editingEnseignant ||
            !editingEnseignant.nom ||
            !editingEnseignant.nom.trim() ||
            !editingEnseignant.email ||
            !editingEnseignant.email.trim()
        ) return

        const { data, error } = await supabase.from('enseignants').update({
            nom: editingEnseignant.nom!.trim(),
            email: editingEnseignant.email!.trim(),
            heures_travail: editingEnseignant.heures_travail?.trim() || null
        }).eq('id', editingEnseignant.id).select()
        if (error) {
            console.error('Erreur mise à jour:', error)
            setError('Erreur lors de la mise à jour.')
        } else if (data) {
            setEnseignants(enseignants.map(e => e.id === editingEnseignant.id ? data[0] : e))
            setEditingEnseignant(null)
            setError(null)
        }
    }

    const handleImportExcel = async (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        try {
        const reader = new FileReader()
            reader.onload = async (e) => {
                const data = e.target?.result
                const workbook = XLSX.read(data, { type: 'binary' })
                const sheetName = workbook.SheetNames[0]
                const sheet = workbook.Sheets[sheetName]
                const jsonData = XLSX.utils.sheet_to_json<ExcelRow>(sheet)

                for (const row of jsonData) {
                    const { error } = await supabase
                        .from('enseignants')
                        .insert([{ 
                            nom: row.nom,
                            email: row.email,
                            heures_travail: row.heures_travail || null
                        }])
                    if (error) {
                        console.error('Erreur lors de l\'importation:', error)
                        setError('Erreur lors de l\'importation des données')
                    }
                }
                fetchEnseignants()
            }
            reader.readAsBinaryString(file)
        } catch (error) {
            console.error('Erreur lors de la lecture du fichier:', error)
            setError('Erreur lors de la lecture du fichier Excel')
        }
    }

    const renderEditForm = () => (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
            <div className="bg-white p-8 rounded-lg shadow-2xl w-full max-w-md">
                <h2 className="text-2xl font-bold text-gray-800 mb-6">Modifier l'Enseignant</h2>
                <form onSubmit={handleUpdateEnseignant} className="space-y-4">
                    <input
                        type="text"
                        value={editingEnseignant?.nom || ''}
                        onChange={(e) => setEditingEnseignant(editingEnseignant ? { ...editingEnseignant, nom: e.target.value } : null)}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        placeholder="Nom de l'enseignant"
                        required
                    />
                    <input
                        type="email"
                        value={editingEnseignant?.email || ''}
                        onChange={(e) => setEditingEnseignant(editingEnseignant ? { ...editingEnseignant, email: e.target.value } : null)}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        placeholder="Email"
                        required
                    />
                    <input
                        type="text"
                        value={editingEnseignant?.heures_travail || ''}
                        onChange={(e) => setEditingEnseignant(editingEnseignant ? { ...editingEnseignant, heures_travail: e.target.value } : null)}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        placeholder="Heures de travail (ex: 9-12,14-18)"
                    />
                    <div className="flex justify-end gap-4 mt-6">
                        <button type="button" onClick={() => setEditingEnseignant(null)} className="px-6 py-2 rounded-lg text-gray-700 bg-gray-200 hover:bg-gray-300">
                            Annuler
                        </button>
                        <button type="submit" className="px-6 py-2 rounded-lg text-white bg-indigo-600 hover:bg-indigo-700">
                            Mettre à jour
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )

    return (
        <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
            <div className="max-w-6xl mx-auto">
                <header className="mb-10">
                    <Link href="/" className="text-indigo-600 hover:text-indigo-800 flex items-center mb-4">
                        <FaArrowLeft className="mr-2" />
                        Retour au tableau de bord
                    </Link>
                    <div className="flex items-center justify-between">
                        <h1 className="text-4xl font-bold text-gray-800 flex items-center">
                            <FaChalkboardTeacher className="mr-3 text-indigo-500" />
                            Gestion des Enseignants
                        </h1>
                        <div className="relative">
                            <input
                                type="file"
                                accept=".xlsx,.xls"
                                onChange={handleImportExcel}
                                className="hidden"
                                id="excel-upload"
                            />
                            <label
                                htmlFor="excel-upload"
                                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 cursor-pointer"
                            >
                                <FaFileExcel />
                                Importer Excel
                            </label>
                        </div>
                    </div>
                </header>

                <div className="bg-white p-8 rounded-xl shadow-md mb-8">
                    <h2 className="text-2xl font-semibold text-gray-700 mb-6">Ajouter un nouvel enseignant</h2>
                    <form onSubmit={handleAddEnseignant} className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <input
                    type="text"
                            value={newEnseignant.nom}
                            onChange={(e) => setNewEnseignant({...newEnseignant, nom: e.target.value})}
                            placeholder="Nom de l'enseignant"
                            className="px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    required
                />
                <input
                    type="email"
                            value={newEnseignant.email}
                            onChange={(e) => setNewEnseignant({...newEnseignant, email: e.target.value})}
                    placeholder="Email"
                            className="px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    required
                />
                        <div className="flex gap-2">
                <input
                                type="text"
                                value={newEnseignant.heures_travail}
                                onChange={(e) => setNewEnseignant({...newEnseignant, heures_travail: e.target.value})}
                    placeholder="Heures de travail"
                                className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                            <button type="submit" className="flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-700 transition-colors">
                                <FaPlus />
                                Ajouter
                </button>
                        </div>
            </form>
                    {error && <p className="text-red-500 mt-4 text-sm">{error}</p>}
                </div>

                <div className="bg-white rounded-xl shadow-md overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-100">
                    <tr>
                                <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">
                                    Nom
                                </th>
                                <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">
                                    Email
                                </th>
                                <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">
                                    Heures de Travail
                                </th>
                                <th scope="col" className="px-6 py-4 text-right text-xs font-bold text-gray-600 uppercase tracking-wider">
                                    Actions
                                </th>
                    </tr>
                </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {loading ? (
                                <tr>
                                    <td colSpan={4} className="text-center py-10 text-gray-500">Chargement...</td>
                                </tr>
                            ) : enseignants.length > 0 ? (
                                enseignants.map((enseignant) => (
                                    <tr key={enseignant.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-sm font-medium text-gray-900">{enseignant.nom}</div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-sm text-gray-900">{enseignant.email}</div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-sm text-gray-900">{enseignant.heures_travail || '-'}</div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                            <button onClick={() => setEditingEnseignant(enseignant)} className="text-indigo-600 hover:text-indigo-900 mr-4">
                                                <FaPencilAlt />
                                </button>
                                            <button onClick={() => handleDeleteEnseignant(enseignant.id)} className="text-red-600 hover:text-red-900">
                                                <FaTrash />
                                </button>
                            </td>
                        </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={4} className="text-center py-10 text-gray-500">Aucun enseignant trouvé.</td>
                                </tr>
                            )}
                </tbody>
            </table>
                </div>
            </div>
            {editingEnseignant && renderEditForm()}
        </div>
    )
}
