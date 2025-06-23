'use client'

import { useState, useEffect, FormEvent } from 'react'
import { supabase } from '@/src/lib/supabaseClient'
import Link from 'next/link'
import { FaLayerGroup, FaPlus, FaTrash, FaPencilAlt, FaArrowLeft } from 'react-icons/fa'

interface Filiere {
    id: number
    nom: string
}

interface Section {
    id: number
    nom: string
    filiere_id: number
    filieres: { nom: string }
}

export default function SectionsPage() {
    const [sections, setSections] = useState<Section[]>([])
    const [filieres, setFilieres] = useState<Filiere[]>([])
    const [newSection, setNewSection] = useState({ nom: '', filiere_id: '' })
    const [editingSection, setEditingSection] = useState<Section | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        fetchInitialData()
    }, [])

    const fetchInitialData = async () => {
        setLoading(true)
        await Promise.all([fetchSections(), fetchFilieres()])
        setLoading(false)
    }

    const fetchSections = async () => {
        const { data, error } = await supabase
            .from('sections')
            .select('*, filieres(nom)')
            .order('nom', { ascending: true })

        if (error) {
            console.error('Erreur de chargement:', error)
            setError('Impossible de charger les sections.')
        } else {
            setSections(data as Section[])
            setError(null)
        }
    }

    const fetchFilieres = async () => {
        const { data, error } = await supabase.from('filieres').select('*').order('nom', { ascending: true })
        if (error) {
            console.error('Erreur de chargement des filières:', error)
        } else {
            setFilieres(data || [])
        }
    }

    const handleAddSection = async (e: FormEvent) => {
        e.preventDefault()
        if (!newSection.nom.trim() || !newSection.filiere_id) {
            setError('Le nom et la filière sont obligatoires.')
            return
        }

        const { data, error } = await supabase
            .from('sections')
            .insert([{ 
                nom: newSection.nom.trim(), 
                filiere_id: parseInt(newSection.filiere_id) 
            }])
            .select('*, filieres(nom)')
        
        if (error) {
            console.error('Erreur ajout:', error)
            setError('Erreur lors de l\'ajout de la section.')
        } else if (data) {
            setSections([...sections, ...(data as Section[])])
            setNewSection({ nom: '', filiere_id: '' })
            setError(null)
        }
    }
    
    const handleDeleteSection = async (id: number) => {
        if (!confirm('Êtes-vous sûr de vouloir supprimer cette section ?')) return

        const { error } = await supabase.from('sections').delete().eq('id', id)
        if (error) {
            console.error('Erreur suppression:', error)
            setError('Impossible de supprimer cette section.')
        } else {
            setSections(sections.filter((s) => s.id !== id))
            setError(null)
        }
    }

    const handleUpdateSection = async (e: FormEvent) => {
        e.preventDefault()
        if (!editingSection || !editingSection.nom.trim()) return

        const { data, error } = await supabase
            .from('sections')
            .update({
                nom: editingSection.nom.trim(),
                filiere_id: editingSection.filiere_id
            })
            .eq('id', editingSection.id)
            .select('*, filieres(nom)')
        
        if (error) {
            console.error('Erreur mise à jour:', error)
            setError('Erreur lors de la mise à jour.')
        } else if (data) {
            setSections(sections.map(s => s.id === editingSection.id ? (data[0] as Section) : s))
            setEditingSection(null)
            setError(null)
        }
    }

    const renderEditForm = () => (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
            <div className="bg-white p-8 rounded-lg shadow-2xl w-full max-w-md">
                <h2 className="text-2xl font-bold text-gray-800 mb-6">Modifier la Section</h2>
                <form onSubmit={handleUpdateSection} className="space-y-4">
                    <input
                        type="text"
                        value={editingSection?.nom || ''}
                        onChange={(e) => setEditingSection(editingSection ? { ...editingSection, nom: e.target.value } : null)}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        placeholder="Nom de la section"
                        required
                    />
                    <select
                        value={editingSection?.filiere_id || ''}
                        onChange={(e) => setEditingSection(editingSection ? { ...editingSection, filiere_id: parseInt(e.target.value) } : null)}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        required
                    >
                        <option value="">Sélectionner une filière</option>
                        {filieres.map(filiere => (
                            <option key={filiere.id} value={filiere.id}>{filiere.nom}</option>
                        ))}
                    </select>
                    <div className="flex justify-end gap-4 mt-6">
                        <button type="button" onClick={() => setEditingSection(null)} className="px-6 py-2 rounded-lg text-gray-700 bg-gray-200 hover:bg-gray-300">
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
                            <FaLayerGroup className="mr-3 text-indigo-500" />
                            Gestion des Sections
                        </h1>
                    </div>
                </header>

                <div className="bg-white p-8 rounded-xl shadow-md mb-8">
                    <h2 className="text-2xl font-semibold text-gray-700 mb-6">Ajouter une nouvelle section</h2>
                    <form onSubmit={handleAddSection} className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <input
                            type="text"
                            value={newSection.nom}
                            onChange={(e) => setNewSection({...newSection, nom: e.target.value})}
                            placeholder="Nom de la section"
                            className="px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            required
                        />
                        <select
                            value={newSection.filiere_id}
                            onChange={(e) => setNewSection({...newSection, filiere_id: e.target.value})}
                            className="px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            required
                        >
                            <option value="">Sélectionner une filière</option>
                            {filieres.map(filiere => (
                                <option key={filiere.id} value={filiere.id}>{filiere.nom}</option>
                            ))}
                        </select>
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
                                    Filière
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
                            ) : sections.length > 0 ? (
                                sections.map((section) => (
                                    <tr key={section.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-sm font-medium text-gray-900">{section.id}</div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-sm font-medium text-gray-900">{section.nom}</div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-sm text-gray-900">{section.filieres?.nom || '-'}</div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                            <button onClick={() => setEditingSection(section)} className="text-indigo-600 hover:text-indigo-900 mr-4">
                                                <FaPencilAlt />
                                            </button>
                                            <button onClick={() => handleDeleteSection(section.id)} className="text-red-600 hover:text-red-900">
                                                <FaTrash />
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={4} className="text-center py-10 text-gray-500">Aucune section trouvée.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
            {editingSection && renderEditForm()}
        </div>
    )
}