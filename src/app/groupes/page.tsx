'use client'

import { useState, useEffect, FormEvent, ChangeEvent } from 'react'
import { supabase } from '@/src/lib/supabaseClient'
import Link from 'next/link'
import { FaUsers, FaPlus, FaTrash, FaPencilAlt, FaArrowLeft, FaFileExcel } from 'react-icons/fa'
import * as XLSX from 'xlsx'

interface Section {
    id: number
    nom: string
    filieres: {
        nom: string
    } | null
}

interface Groupe {
    id: string
    nom: string
    niveau: string | null
    specialite: string | null
    section_id: number | null
    created_at: string
    sections: { 
        nom: string
        filieres: {
            nom: string
        } | null
    } | null
}

interface ExcelRow {
    nom: string;
    niveau?: string;
    specialite?: string;
    section_nom?: string;
}

export default function GroupesPage() {
    const [groupes, setGroupes] = useState<Groupe[]>([])
    const [sections, setSections] = useState<Section[]>([])
    const [newGroupe, setNewGroupe] = useState({ 
        nom: '', 
        niveau: '',
        specialite: '',
        section_id: '' 
    })
    const [editingGroupe, setEditingGroupe] = useState<Groupe | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        fetchInitialData()
    }, [])

    const fetchInitialData = async () => {
        setLoading(true)
        await Promise.all([fetchGroupes(), fetchSections()])
        setLoading(false)
    }

    const fetchGroupes = async () => {
        const { data, error } = await supabase
            .from('groupes')
            .select('*, sections(nom, filieres(nom))')
            .order('nom', { ascending: true })

        if (error) {
            console.error('Erreur de chargement:', error)
            setError('Impossible de charger les groupes.')
        } else {
            setGroupes(data as Groupe[])
            setError(null)
        }
    }

    const fetchSections = async () => {
        const { data, error } = await supabase
            .from('sections')
            .select('*, filieres(nom)')
            .order('nom', { ascending: true })
        if (error) {
            console.error('Erreur de chargement des sections:', error)
        } else {
            setSections(data || [])
        }
    }

    const handleAddGroupe = async (e: FormEvent) => {
        e.preventDefault()
        if (!newGroupe.nom.trim()) {
            setError('Le nom est obligatoire.')
            return
        }

        const { data, error } = await supabase
            .from('groupes')
            .insert([{ 
                nom: newGroupe.nom.trim(),
                niveau: newGroupe.niveau || null,
                specialite: newGroupe.specialite || null,
                section_id: newGroupe.section_id ? parseInt(newGroupe.section_id) : null
            }])
            .select('*, sections(nom, filieres(nom))')
        
        if (error) {
            console.error('Erreur ajout:', error)
            setError('Erreur lors de l\'ajout du groupe.')
        } else if (data) {
            setGroupes([...groupes, ...(data as Groupe[])])
            setNewGroupe({ nom: '', niveau: '', specialite: '', section_id: '' })
            setError(null)
        }
    }
    
    const handleDeleteGroupe = async (id: string) => {
        if (!confirm('Êtes-vous sûr de vouloir supprimer ce groupe ?')) return

        const { error } = await supabase.from('groupes').delete().eq('id', id)
        if (error) {
            console.error('Erreur suppression:', error)
            setError('Impossible de supprimer ce groupe.')
        } else {
            setGroupes(groupes.filter((g) => g.id !== id))
            setError(null)
        }
    }

    const handleUpdateGroupe = async (e: FormEvent) => {
        e.preventDefault()
        if (!editingGroupe || !editingGroupe.nom.trim()) return

        const { data, error } = await supabase
            .from('groupes')
            .update({
                nom: editingGroupe.nom.trim(),
                niveau: editingGroupe.niveau?.trim() || null,
                specialite: editingGroupe.specialite?.trim() || null,
                section_id: editingGroupe.section_id
            })
            .eq('id', editingGroupe.id)
            .select('*, sections(nom, filieres(nom))')
        
        if (error) {
            console.error('Erreur mise à jour:', error)
            setError('Erreur lors de la mise à jour.')
        } else if (data) {
            setGroupes(groupes.map(g => g.id === editingGroupe.id ? (data[0] as Groupe) : g))
            setEditingGroupe(null)
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

                // Récupère toutes les sections existantes
                const { data: sectionsData, error: sectionsError } = await supabase.from('sections').select('*')
                if (sectionsError) {
                    setError('Erreur lors de la récupération des sections')
                    return
                }

                const notFoundSections = new Set<string>()

                for (const row of jsonData) {
                    if (!row.nom) continue

                    // Trouve l'ID de la section à partir du nom si fourni
                    let section_id = null
                    const section_nom = row.section_nom
                    if (typeof section_nom === 'string' && section_nom.trim()) {
                        const section = sectionsData.find(s => 
                            s.nom.trim().toLowerCase() === section_nom.trim().toLowerCase()
                        )
                        if (section) {
                            section_id = section.id
                        } else {
                            notFoundSections.add(section_nom)
                            continue
                        }
                    }

                    const { error } = await supabase
                        .from('groupes')
                        .insert([{ 
                            nom: row.nom.trim(),
                            niveau: row.niveau?.trim() || null,
                            specialite: row.specialite?.trim() || null,
                            section_id: section_id
                        }])

                    if (error) {
                        console.error('Erreur lors de l\'importation:', error, row)
                        setError('Erreur lors de l\'importation des données')
                    }
                }

                if (notFoundSections.size > 0) {
                    console.warn('Sections non trouvées dans la base :', Array.from(notFoundSections))
                    setError('Sections non trouvées : ' + Array.from(notFoundSections).join(', '))
                }

                fetchGroupes()
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
                <h2 className="text-2xl font-bold text-gray-800 mb-6">Modifier le Groupe</h2>
                <form onSubmit={handleUpdateGroupe} className="space-y-4">
                    <input
                        type="text"
                        value={editingGroupe?.nom || ''}
                        onChange={(e) => setEditingGroupe(editingGroupe ? { ...editingGroupe, nom: e.target.value } : null)}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        placeholder="Nom du groupe"
                        required
                    />
                    <input
                        type="text"
                        value={editingGroupe?.niveau || ''}
                        onChange={(e) => setEditingGroupe(editingGroupe ? { ...editingGroupe, niveau: e.target.value } : null)}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        placeholder="Niveau"
                    />
                    <input
                        type="text"
                        value={editingGroupe?.specialite || ''}
                        onChange={(e) => setEditingGroupe(editingGroupe ? { ...editingGroupe, specialite: e.target.value } : null)}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        placeholder="Spécialité"
                    />
                    <select
                        value={editingGroupe?.section_id || ''}
                        onChange={(e) => setEditingGroupe(editingGroupe ? { ...editingGroupe, section_id: parseInt(e.target.value) } : null)}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                        <option value="">Sélectionner une section</option>
                        {sections.map(section => (
                            <option key={section.id} value={section.id}>
                                {`${section.filieres?.nom || 'Filière N/A'} - ${section.nom}`}
                            </option>
                        ))}
                    </select>
                    <div className="flex justify-end gap-4 mt-6">
                        <button type="button" onClick={() => setEditingGroupe(null)} className="px-6 py-2 rounded-lg text-gray-700 bg-gray-200 hover:bg-gray-300">
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
                            <FaUsers className="mr-3 text-indigo-500" />
                            Gestion des Groupes
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
                    <h2 className="text-2xl font-semibold text-gray-700 mb-6">Ajouter un nouveau groupe</h2>
                    <form onSubmit={handleAddGroupe} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <input
                            type="text"
                            value={newGroupe.nom}
                            onChange={(e) => setNewGroupe({...newGroupe, nom: e.target.value})}
                            placeholder="Nom du groupe"
                            className="px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            required
                        />
                        <input
                            type="text"
                            value={newGroupe.niveau}
                            onChange={(e) => setNewGroupe({...newGroupe, niveau: e.target.value})}
                            placeholder="Niveau"
                            className="px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                        <input
                            type="text"
                            value={newGroupe.specialite}
                            onChange={(e) => setNewGroupe({...newGroupe, specialite: e.target.value})}
                            placeholder="Spécialité"
                            className="px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                        <select
                            value={newGroupe.section_id}
                            onChange={(e) => setNewGroupe({...newGroupe, section_id: e.target.value})}
                            className="px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                            <option value="">Sélectionner une section</option>
                            {sections.map(section => (
                                <option key={section.id} value={section.id}>
                                    {`${section.filieres?.nom || 'Filière N/A'} - ${section.nom}`}
                                </option>
                            ))}
                        </select>
                        <div className="md:col-span-2">
                            <button type="submit" className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-700 transition-colors">
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
                                    Niveau
                                </th>
                                <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">
                                    Spécialité
                                </th>
                                <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">
                                    Section
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
                                    <td colSpan={6} className="text-center py-10 text-gray-500">Chargement...</td>
                                </tr>
                            ) : groupes.length > 0 ? (
                                groupes.map((groupe) => (
                                    <tr key={groupe.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-sm font-medium text-gray-900">{groupe.nom}</div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-sm text-gray-900">{groupe.niveau || '-'}</div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-sm text-gray-900">{groupe.specialite || '-'}</div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-sm text-gray-900">{groupe.sections?.nom || '-'}</div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-sm text-gray-900">{groupe.sections?.filieres?.nom || '-'}</div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                            <button onClick={() => setEditingGroupe(groupe)} className="text-indigo-600 hover:text-indigo-900 mr-4">
                                                <FaPencilAlt />
                                            </button>
                                            <button onClick={() => handleDeleteGroupe(groupe.id)} className="text-red-600 hover:text-red-900">
                                                <FaTrash />
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={6} className="text-center py-10 text-gray-500">Aucun groupe trouvé.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
            {editingGroupe && renderEditForm()}
        </div>
    )
} 