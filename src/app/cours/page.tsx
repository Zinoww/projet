'use client'

import { useState, useEffect, FormEvent } from 'react'
import { supabase } from '@/src/lib/supabaseClient'
import Link from 'next/link'
import { FaBook, FaPlus, FaTrash, FaPencilAlt, FaArrowLeft } from 'react-icons/fa'

interface Enseignant {
    id: string
    nom: string
}

interface Groupe {
    id: string
    nom: string
    sections: {
        nom: string
        filieres: {
            nom: string
        } | null
    } | null
}

interface Cour {
    id: string
    nom: string
    heures: number | null
    type: string | null
    niveau: string | null
    enseignant_id: string | null
    groupe_id: string | null
    enseignants: { nom: string } | null
    groupes: { nom: string } | null
}

const NIVEAUX = ['L1', 'L2', 'L3', 'M1', 'M2']
const TYPES = ['CM', 'TD', 'TP']

export default function CoursPage() {
    const [cours, setCours] = useState<Cour[]>([])
    const [enseignants, setEnseignants] = useState<Enseignant[]>([])
    const [groupes, setGroupes] = useState<Groupe[]>([])
    const [newCour, setNewCour] = useState({
        nom: '',
        heures: '',
        type: '',
        niveau: '',
        enseignant_id: '',
        groupe_id: ''
    })
    const [editingCour, setEditingCour] = useState<Cour | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        fetchInitialData()
    }, [])

    const fetchInitialData = async () => {
        setLoading(true)
        await Promise.all([fetchCours(), fetchEnseignants(), fetchGroupes()])
        setLoading(false)
    }

    const fetchCours = async () => {
        const { data, error } = await supabase
            .from('cours')
            .select('*, enseignants(nom), groupes(nom)')
            .order('nom', { ascending: true })

        if (error) {
            console.error('Erreur de chargement:', error)
            setError('Impossible de charger les cours.')
        } else {
            setCours(data)
            setError(null)
        }
    }

    const fetchEnseignants = async () => {
        const { data, error } = await supabase.from('enseignants').select('id, nom').order('nom')
        if (!error) setEnseignants(data || [])
    }

    const fetchGroupes = async () => {
        const { data, error } = await supabase
            .from('groupes')
            .select('id, nom, sections(nom, filieres(nom))')
            .order('nom')
        if (!error) setGroupes(data as any || [])
    }

    const handleAddCour = async (e: FormEvent) => {
        e.preventDefault()
        if (!newCour.nom.trim()) {
            setError('Le nom du cours est obligatoire.')
            return
        }

        const { data, error } = await supabase.from('cours').insert([{
            nom: newCour.nom.trim(),
            heures: newCour.heures ? parseInt(newCour.heures) : null,
            type: newCour.type || null,
            niveau: newCour.niveau || null,
            enseignant_id: newCour.enseignant_id || null,
            groupe_id: newCour.groupe_id || null
        }]).select('*, enseignants(nom), groupes(nom)')
        
        if (error) {
            console.error('Erreur ajout:', error)
            setError('Erreur lors de l\'ajout du cours.')
        } else if (data) {
            setCours([...cours, ...data])
            setNewCour({ nom: '', heures: '', type: '', niveau: '', enseignant_id: '', groupe_id: '' })
            setError(null)
        }
    }
    
    const handleDeleteCour = async (id: string) => {
        if (!confirm('Êtes-vous sûr de vouloir supprimer ce cours ?')) return

        const { error } = await supabase.from('cours').delete().eq('id', id)
        if (error) {
            console.error('Erreur suppression:', error)
            setError('Impossible de supprimer ce cours.')
        } else {
            setCours(cours.filter((c) => c.id !== id))
            setError(null)
        }
    }

    const handleUpdateCour = async (e: FormEvent) => {
        e.preventDefault()
        if (!editingCour || !editingCour.nom.trim()) return

        const { data, error } = await supabase.from('cours').update({
            nom: editingCour.nom.trim(),
            heures: editingCour.heures,
            type: editingCour.type,
            niveau: editingCour.niveau,
            enseignant_id: editingCour.enseignant_id,
            groupe_id: editingCour.groupe_id
        }).eq('id', editingCour.id).select('*, enseignants(nom), groupes(nom)')
        
        if (error) {
            console.error('Erreur mise à jour:', error)
            setError('Erreur lors de la mise à jour.')
        } else if (data) {
            setCours(cours.map(c => c.id === editingCour.id ? data[0] : c))
            setEditingCour(null)
            setError(null)
        }
    }

    const renderEditForm = () => (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
            <div className="bg-white p-8 rounded-lg shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
                <h2 className="text-2xl font-bold text-gray-800 mb-6">Modifier le Cours</h2>
                <form onSubmit={handleUpdateCour} className="space-y-4">
                    <input
                        type="text"
                        value={editingCour?.nom || ''}
                        onChange={(e) => setEditingCour(editingCour ? { ...editingCour, nom: e.target.value } : null)}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        placeholder="Nom du cours"
                        required
                    />
                    <input
                        type="number"
                        value={editingCour?.heures || ''}
                        onChange={(e) => setEditingCour(editingCour ? { ...editingCour, heures: e.target.value ? parseInt(e.target.value) : null } : null)}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        placeholder="Heures"
                    />
                    <select
                        value={editingCour?.type || ''}
                        onChange={(e) => setEditingCour(editingCour ? { ...editingCour, type: e.target.value || null } : null)}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                        <option value="">Sélectionner un type</option>
                        {TYPES.map(type => (
                            <option key={type} value={type}>{type}</option>
                        ))}
                    </select>
                    <select
                        value={editingCour?.niveau || ''}
                        onChange={(e) => setEditingCour(editingCour ? { ...editingCour, niveau: e.target.value || null } : null)}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                        <option value="">Sélectionner un niveau</option>
                        {NIVEAUX.map(niveau => (
                            <option key={niveau} value={niveau}>{niveau}</option>
                        ))}
                    </select>
                    <select
                        value={editingCour?.enseignant_id || ''}
                        onChange={(e) => setEditingCour(editingCour ? { ...editingCour, enseignant_id: e.target.value || null } : null)}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                        <option value="">Sélectionner un enseignant</option>
                        {enseignants.map(enseignant => (
                            <option key={enseignant.id} value={enseignant.id}>{enseignant.nom}</option>
                        ))}
                    </select>
                    <select
                        value={editingCour?.groupe_id || ''}
                        onChange={(e) => setEditingCour(editingCour ? { ...editingCour, groupe_id: e.target.value || null } : null)}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                        <option value="">Sélectionner un groupe</option>
                        {groupes.map(groupe => (
                            <option key={groupe.id} value={groupe.id}>
                                {`${groupe.sections?.filieres?.nom || 'Filière N/A'} - ${groupe.sections?.nom || 'Section N/A'} - ${groupe.nom}`}
                            </option>
                        ))}
                    </select>
                    <div className="flex justify-end gap-4 mt-6">
                        <button type="button" onClick={() => setEditingCour(null)} className="px-6 py-2 rounded-lg text-gray-700 bg-gray-200 hover:bg-gray-300">
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
            <div className="max-w-7xl mx-auto">
                <header className="mb-10">
                    <Link href="/" className="text-indigo-600 hover:text-indigo-800 flex items-center mb-4">
                        <FaArrowLeft className="mr-2" />
                        Retour au tableau de bord
                    </Link>
                    <div className="flex items-center justify-between">
                        <h1 className="text-4xl font-bold text-gray-800 flex items-center">
                            <FaBook className="mr-3 text-indigo-500" />
                            Gestion des Cours
                        </h1>
                    </div>
                </header>

                <div className="bg-white p-8 rounded-xl shadow-md mb-8">
                    <h2 className="text-2xl font-semibold text-gray-700 mb-6">Ajouter un nouveau cours</h2>
                    <form onSubmit={handleAddCour} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        <input
                            type="text"
                            value={newCour.nom}
                            onChange={(e) => setNewCour({...newCour, nom: e.target.value})}
                            placeholder="Nom du cours"
                            className="px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            required
                        />
                        <input
                            type="number"
                            value={newCour.heures}
                            onChange={(e) => setNewCour({...newCour, heures: e.target.value})}
                            placeholder="Heures"
                            className="px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                        <select
                            value={newCour.type}
                            onChange={(e) => setNewCour({...newCour, type: e.target.value})}
                            className="px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                            <option value="">Type</option>
                            {TYPES.map(type => (
                                <option key={type} value={type}>{type}</option>
                            ))}
                        </select>
                        <select
                            value={newCour.niveau}
                            onChange={(e) => setNewCour({...newCour, niveau: e.target.value})}
                            className="px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                            <option value="">Niveau</option>
                            {NIVEAUX.map(niveau => (
                                <option key={niveau} value={niveau}>{niveau}</option>
                            ))}
                        </select>
                        <select
                            value={newCour.enseignant_id}
                            onChange={(e) => setNewCour({...newCour, enseignant_id: e.target.value})}
                            className="px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                            <option value="">Enseignant</option>
                            {enseignants.map(enseignant => (
                                <option key={enseignant.id} value={enseignant.id}>{enseignant.nom}</option>
                            ))}
                        </select>
                        <div className="flex gap-2">
                            <select
                                value={newCour.groupe_id}
                                onChange={(e) => setNewCour({...newCour, groupe_id: e.target.value})}
                                className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            >
                                <option value="">Groupe</option>
                                {groupes.map(groupe => (
                                    <option key={groupe.id} value={groupe.id}>
                                        {`${groupe.sections?.filieres?.nom || 'Filière N/A'} - ${groupe.sections?.nom || 'Section N/A'} - ${groupe.nom}`}
                                    </option>
                                ))}
                            </select>
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
                                    Heures
                                </th>
                                <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">
                                    Type
                                </th>
                                <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">
                                    Niveau
                                </th>
                                <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">
                                    Enseignant
                                </th>
                                <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">
                                    Groupe
                                </th>
                                <th scope="col" className="px-6 py-4 text-right text-xs font-bold text-gray-600 uppercase tracking-wider">
                                    Actions
                                </th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {loading ? (
                                <tr>
                                    <td colSpan={7} className="text-center py-10 text-gray-500">Chargement...</td>
                                </tr>
                            ) : cours.length > 0 ? (
                                cours.map((cour) => (
                                    <tr key={cour.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-sm font-medium text-gray-900">{cour.nom}</div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-sm text-gray-900">{cour.heures || '-'}</div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-sm text-gray-900">{cour.type || '-'}</div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-sm text-gray-900">{cour.niveau || '-'}</div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-sm text-gray-900">{cour.enseignants?.nom || '-'}</div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-sm text-gray-900">{cour.groupes?.nom || '-'}</div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                            <button onClick={() => setEditingCour(cour)} className="text-indigo-600 hover:text-indigo-900 mr-4">
                                                <FaPencilAlt />
                                            </button>
                                            <button onClick={() => handleDeleteCour(cour.id)} className="text-red-600 hover:text-red-900">
                                                <FaTrash />
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={7} className="text-center py-10 text-gray-500">Aucun cours trouvé.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
            {editingCour && renderEditForm()}
        </div>
    )
}
