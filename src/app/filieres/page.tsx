'use client'

import { useState, useEffect, FormEvent, ChangeEvent } from 'react'
import { supabase } from '@/src/lib/supabaseClient'
import Link from 'next/link'
import { FaUniversity, FaPlus, FaTrash, FaPencilAlt, FaArrowLeft, FaFileExcel } from 'react-icons/fa'
import * as XLSX from 'xlsx'

interface Filiere {
    id: string
    nom: string
}

export default function FilieresPage() {
    const [filieres, setFilieres] = useState<Filiere[]>([])
    const [newFiliereName, setNewFiliereName] = useState('')
    const [editingFiliere, setEditingFiliere] = useState<Filiere | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        fetchFilieres()
    }, [])

    const fetchFilieres = async () => {
        setLoading(true)
        const { data, error } = await supabase.from('filieres').select('*').order('nom', { ascending: true })
        if (error) {
            console.error('Erreur de chargement:', error)
            setError('Impossible de charger les filières.')
        } else {
            console.log('Filières existantes:', data)
            setFilieres(data)
            setError(null)
        }
        setLoading(false)
    }

    const handleAddFiliere = async (e: FormEvent) => {
        e.preventDefault()
        if (!newFiliereName.trim()) return

        const { data, error } = await supabase.from('filieres').insert([{ nom: newFiliereName.trim() }]).select()
        if (error) {
            console.error('Erreur ajout:', error)
            setError('Cette filière existe peut-être déjà.')
        } else if (data) {
            setFilieres([...filieres, ...data])
            setNewFiliereName('')
            setError(null)
        }
    }
    
    const handleDeleteFiliere = async (id: string) => {
        if (!confirm('Êtes-vous sûr de vouloir supprimer cette filière ?')) return

        const { error } = await supabase.from('filieres').delete().eq('id', id)
        if (error) {
            console.error('Erreur suppression:', error)
            setError('Impossible de supprimer cette filière. Elle est peut-être liée à des sections.')
        } else {
            setFilieres(filieres.filter((f) => f.id !== id))
            setError(null)
        }
    }

    const handleUpdateFiliere = async (e: FormEvent) => {
        e.preventDefault()
        if (!editingFiliere || !editingFiliere.nom.trim()) return

        const { data, error } = await supabase.from('filieres').update({ nom: editingFiliere.nom.trim() }).eq('id', editingFiliere.id).select()
        if (error) {
            console.error('Erreur mise à jour:', error)
            setError('Erreur lors de la mise à jour.')
        } else if (data) {
            setFilieres(filieres.map(f => f.id === editingFiliere.id ? data[0] : f))
            setEditingFiliere(null)
            setError(null)
        }
    }

    const handleImportExcel = async (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        try {
            const reader = new FileReader()
            reader.onload = async (e) => {
                try {
                    const data = e.target?.result
                    if (!data) {
                        setError('Erreur: Fichier vide')
                        return
                    }
                    
                    const workbook = XLSX.read(data, { type: 'binary' })
                    const sheetName = workbook.SheetNames[0]
                    const sheet = workbook.Sheets[sheetName]
                    const jsonData = XLSX.utils.sheet_to_json<{ nom: string }>(sheet)
                    
                    console.log('Données lues du fichier Excel:', jsonData)

                    if (jsonData.length === 0) {
                        setError('Erreur: Aucune donnée trouvée dans le fichier')
                        return
                    }

                    for (const row of jsonData) {
                        if (!row.nom) {
                            console.error('Ligne invalide:', row)
                            continue
                        }

                        const { data: insertData, error } = await supabase
                            .from('filieres')
                            .insert([{ nom: row.nom.trim() }])
                            .select()

                        if (error) {
                            console.error('Erreur détaillée:', {
                                error,
                                message: error.message,
                                details: error.details,
                                data: row
                            })
                            setError(`Erreur lors de l'importation: ${error.message || error.details || 'Erreur inconnue'}`)
                        } else {
                            console.log('Insertion réussie:', insertData)
                        }
                    }
                    
                    // Rafraîchir la liste après l'importation
                    await fetchFilieres()
                    setError(null)
                } catch (err) {
                    console.error('Erreur lors du traitement:', err)
                    setError('Erreur lors du traitement du fichier Excel')
                }
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
                <h2 className="text-2xl font-bold text-gray-800 mb-6">Modifier la Filière</h2>
                <form onSubmit={handleUpdateFiliere}>
                    <input
                        type="text"
                        value={editingFiliere?.nom || ''}
                        onChange={(e) => setEditingFiliere(editingFiliere ? { ...editingFiliere, nom: e.target.value } : null)}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        placeholder="Nouveau nom de la filière"
                    />
                    <div className="flex justify-end gap-4 mt-6">
                        <button type="button" onClick={() => setEditingFiliere(null)} className="px-6 py-2 rounded-lg text-gray-700 bg-gray-200 hover:bg-gray-300">
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
                            <FaUniversity className="mr-3 text-indigo-500" />
                            Gestion des Filières
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
                    <h2 className="text-2xl font-semibold text-gray-700 mb-6">Ajouter une nouvelle filière</h2>
                    <form onSubmit={handleAddFiliere} className="flex flex-col sm:flex-row gap-4 items-center">
                        <input
                            type="text"
                            value={newFiliereName}
                            onChange={(e) => setNewFiliereName(e.target.value)}
                            placeholder="Nom de la filière"
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 flex-grow"
                        />
                        <button type="submit" className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-700 transition-colors">
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
                                    Nom de la Filière
                                </th>
                                <th scope="col" className="px-6 py-4 text-right text-xs font-bold text-gray-600 uppercase tracking-wider">
                                    Actions
                                </th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {loading ? (
                                <tr>
                                    <td colSpan={2} className="text-center py-10 text-gray-500">Chargement...</td>
                                </tr>
                            ) : filieres.length > 0 ? (
                                filieres.map((filiere) => (
                                    <tr key={filiere.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-sm font-medium text-gray-900">{filiere.nom}</div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                            <button onClick={() => setEditingFiliere(filiere)} className="text-indigo-600 hover:text-indigo-900 mr-4">
                                                <FaPencilAlt />
                                            </button>
                                            <button onClick={() => handleDeleteFiliere(filiere.id)} className="text-red-600 hover:text-red-900">
                                                <FaTrash />
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={2} className="text-center py-10 text-gray-500">Aucune filière trouvée.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
            {editingFiliere && renderEditForm()}
        </div>
    )
} 