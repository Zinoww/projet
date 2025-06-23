'use client'

import { useState, useEffect, FormEvent, ChangeEvent } from 'react'
import { supabase } from '@/src/lib/supabaseClient'
import Link from 'next/link'
import { FaBuilding, FaPlus, FaTrash, FaPencilAlt, FaArrowLeft, FaFileExcel } from 'react-icons/fa'
import * as XLSX from 'xlsx'

interface Salle {
    id: number
    nom: string
    capacite: number
}

interface ExcelRow {
    nom: string;
    capacite: number;
}

export default function SallesPage() {
    const [salles, setSalles] = useState<Salle[]>([])
    const [newSalle, setNewSalle] = useState({ nom: '', capacite: '' })
    const [editingSalle, setEditingSalle] = useState<Salle | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        fetchSalles()
    }, [])

    const fetchSalles = async () => {
        setLoading(true)
        const { data, error } = await supabase.from('salles').select('*').order('nom', { ascending: true })
            if (error) {
            console.error('Erreur de chargement:', error)
            setError('Impossible de charger les salles.')
        } else {
            setSalles(data)
            setError(null)
        }
        setLoading(false)
    }

    const handleAddSalle = async (e: FormEvent) => {
        e.preventDefault()
        if (!newSalle.nom.trim() || !newSalle.capacite.trim()) {
            setError('Le nom et la capacité sont obligatoires.')
                return
            }

        const { data, error } = await supabase.from('salles').insert([{
            nom: newSalle.nom.trim(),
            capacite: parseInt(newSalle.capacite)
        }]).select()

            if (error) {
            console.error('Erreur ajout:', error)
            setError('Erreur lors de l\'ajout de la salle.')
        } else if (data) {
            setSalles([...salles, ...data])
            setNewSalle({ nom: '', capacite: '' })
            setError(null)
        }
    }
    
    const handleDeleteSalle = async (id: number) => {
        if (!confirm('Êtes-vous sûr de vouloir supprimer cette salle ?')) return

        const { error } = await supabase.from('salles').delete().eq('id', id)
        if (error) {
            console.error('Erreur suppression:', error)
            setError('Impossible de supprimer cette salle.')
        } else {
            setSalles(salles.filter((s) => s.id !== id))
            setError(null)
        }
    }

    const handleUpdateSalle = async (e: FormEvent) => {
        e.preventDefault()
        if (!editingSalle || !editingSalle.nom.trim()) return

        const { data, error } = await supabase.from('salles').update({
            nom: editingSalle.nom.trim(),
            capacite: editingSalle.capacite
        }).eq('id', editingSalle.id).select()
        
        if (error) {
            console.error('Erreur mise à jour:', error)
            setError('Erreur lors de la mise à jour.')
        } else if (data) {
            setSalles(salles.map(s => s.id === editingSalle.id ? data[0] : s))
            setEditingSalle(null)
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
                        .from('salles')
                        .insert([{ 
                            nom: row.nom,
                            capacite: row.capacite
                        }])
                    if (error) {
                        console.error('Erreur lors de l\'importation:', error)
                        setError('Erreur lors de l\'importation des données')
                    }
                }
                fetchSalles()
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
                <h2 className="text-2xl font-bold text-gray-800 mb-6">Modifier la Salle</h2>
                <form onSubmit={handleUpdateSalle} className="space-y-4">
                    <input
                        type="text"
                        value={editingSalle?.nom || ''}
                        onChange={(e) => setEditingSalle(editingSalle ? { ...editingSalle, nom: e.target.value } : null)}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        placeholder="Nom de la salle"
                        required
                    />
                    <input
                        type="number"
                        value={editingSalle?.capacite || ''}
                        onChange={(e) => setEditingSalle(editingSalle ? { ...editingSalle, capacite: parseInt(e.target.value) || 0 } : null)}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        placeholder="Capacité"
                        required
                    />
                    <div className="flex justify-end gap-4 mt-6">
                        <button type="button" onClick={() => setEditingSalle(null)} className="px-6 py-2 rounded-lg text-gray-700 bg-gray-200 hover:bg-gray-300">
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
            <div className="max-w-4xl mx-auto">
                <header className="mb-10">
                    <Link href="/" className="text-indigo-600 hover:text-indigo-800 flex items-center mb-4">
                        <FaArrowLeft className="mr-2" />
                        Retour au tableau de bord
                    </Link>
                    <div className="flex items-center justify-between">
                        <h1 className="text-4xl font-bold text-gray-800 flex items-center">
                            <FaBuilding className="mr-3 text-indigo-500" />
                            Gestion des Salles
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
                    <h2 className="text-2xl font-semibold text-gray-700 mb-6">Ajouter une nouvelle salle</h2>
                    <form onSubmit={handleAddSalle} className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <input
                    type="text"
                            value={newSalle.nom}
                            onChange={(e) => setNewSalle({...newSalle, nom: e.target.value})}
                    placeholder="Nom de la salle"
                            className="px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    required
                />
                <input
                    type="number"
                            value={newSalle.capacite}
                            onChange={(e) => setNewSalle({...newSalle, capacite: e.target.value})}
                    placeholder="Capacité"
                            className="px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    required
                />
                        <button type="submit" className="flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-700 transition-colors">
                            <FaPlus />
                            Ajouter
                    </button>
            </form>
                    {error && <p className="text-red-500 mt-4 text-sm">{error}</p>}
                </div>

                <div className="bg-white rounded-xl shadow-md overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-100">
                    <tr>
                                <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">
                                    ID
                                </th>
                                <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">
                                    Nom
                                </th>
                                <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">
                                    Capacité
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
                            ) : salles.length > 0 ? (
                                salles.map((salle) => (
                                    <tr key={salle.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-sm font-medium text-gray-900">{salle.id}</div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-sm font-medium text-gray-900">{salle.nom}</div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-sm text-gray-900">{salle.capacite}</div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                            <button onClick={() => setEditingSalle(salle)} className="text-indigo-600 hover:text-indigo-900 mr-4">
                                                <FaPencilAlt />
                                </button>
                                            <button onClick={() => handleDeleteSalle(salle.id)} className="text-red-600 hover:text-red-900">
                                                <FaTrash />
                                </button>
                            </td>
                        </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={4} className="text-center py-10 text-gray-500">Aucune salle trouvée.</td>
                                </tr>
                            )}
                </tbody>
            </table>
                </div>
            </div>
            {editingSalle && renderEditForm()}
        </div>
    )
}
