'use client'

import { useState, useEffect, FormEvent, ChangeEvent } from 'react'
import { supabase } from '@/src/lib/supabaseClient'
import Link from 'next/link'
import { FaBook, FaPlus, FaTrash, FaPencilAlt, FaArrowLeft, FaFileExcel } from 'react-icons/fa'
import * as XLSX from 'xlsx'

// Interface correspondant à la nouvelle table `cours`
interface Cours {
  id: string
  nom: string
  niveau: string | null
}

interface ExcelRow {
    nom: string;
    niveau?: string;
}

const NIVEAUX = ['L1', 'L2', 'L3', 'M1', 'M2'];

export default function CoursPage() {
    const [cours, setCours] = useState<Cours[]>([])
    const [newCours, setNewCours] = useState({
        nom: '',
        niveau: ''
    })
    const [editingCours, setEditingCours] = useState<Cours | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)

    useEffect(() => {
        fetchCours()
    }, [])

    const fetchCours = async () => {
        setLoading(true)
        const { data, error } = await supabase
            .from('cours')
            .select('*')
            .order('nom', { ascending: true })

        if (error) {
            console.error('Erreur de chargement:', error)
            setError('Impossible de charger les cours.')
        } else {
            setCours(data as Cours[])
            setError(null)
        }
        setLoading(false)
    }

    const handleImportExcel = async (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setLoading(true);
        setError(null);
        setSuccess(null);

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const data = event.target?.result;
                const workbook = XLSX.read(data, { type: 'binary' });
                const sheetName = workbook.SheetNames[0];
                const sheet = workbook.Sheets[sheetName];
                const jsonData = XLSX.utils.sheet_to_json<ExcelRow>(sheet);

                const coursToInsert = jsonData.map(row => {
                    if (!row.nom || typeof row.nom !== 'string' || row.nom.trim() === '') {
                        throw new Error('Chaque ligne doit avoir un "nom" valide.');
                    }
                    if (row.niveau && !NIVEAUX.includes(row.niveau.trim())) {
                        throw new Error(`Le niveau &apos;${row.niveau}&apos; n&apos;est pas valide. Utilisez L1, L2, L3, M1 ou M2.`);
                    }
                    return { 
                        nom: row.nom.trim(),
                        niveau: row.niveau ? row.niveau.trim() : null
                    };
                });

                if (coursToInsert.length > 0) {
                    const { error: insertError } = await supabase.from('cours').insert(coursToInsert);
                    if (insertError) {
                        throw new Error(insertError.message);
                    }
                    setSuccess(`${coursToInsert.length} cours importé(s) avec succès.`);
                    fetchCours(); // Rafraîchir la liste
                } else {
                    setError("Le fichier Excel ne contient aucune ligne valide à importer.");
                }

            } catch (err) {
                setError(`Erreur lors de l&apos;importation : ${(err as Error)?.message || 'Inconnue'}`);
            } finally {
                setLoading(false);
                e.target.value = '';
            }
        };
        reader.readAsBinaryString(file);
    };

    const handleAddCours = async (e: FormEvent) => {
        e.preventDefault()
        if (!newCours.nom.trim() || !newCours.niveau) {
            setError('Le nom et le niveau sont obligatoires.')
            return
        }
        setError(null)
        setSuccess(null)

        const { data, error } = await supabase.from('cours').insert([{ 
            nom: newCours.nom.trim(),
            niveau: newCours.niveau
        }]).select()
        
        if (error) {
            console.error('Erreur ajout:', error)
            setError(`Erreur lors de l&apos;ajout du cours: ${error.message}`)
            setSuccess(null)
        } else if (data) {
            fetchCours() // Re-fetch pour avoir la liste à jour
            setNewCours({ nom: '', niveau: '' })
            setError(null)
            setSuccess('Cours ajouté avec succès !')
        }
    }
    
    const handleDeleteCours = async (id: string) => {
        if (!confirm('Êtes-vous sûr de vouloir supprimer ce cours ? La suppression est irréversible.')) return

        const { error } = await supabase.from('cours').delete().eq('id', id)
        if (error) {
            console.error('Erreur suppression:', error)
            setError(`Impossible de supprimer ce cours: ${error.message}`)
            setSuccess(null)
        } else {
            setCours(cours.filter((c) => c.id !== id))
            setError(null)
            setSuccess('Cours supprimé avec succès.')
        }
    }

    const handleUpdateCours = async (e: FormEvent) => {
        e.preventDefault()
        if (!editingCours || !editingCours.nom.trim() || !editingCours.niveau) return

        const { data, error } = await supabase
            .from('cours')
            .update({ 
                nom: editingCours.nom.trim(),
                niveau: editingCours.niveau
            })
            .eq('id', editingCours.id)
            .select()
        
        if (error) {
            console.error('Erreur mise à jour:', error)
            setError(`Erreur lors de la mise à jour: ${error.message}`)
            setSuccess(null)
        } else if (data) {
            fetchCours() // Re-fetch pour avoir la liste à jour
            setEditingCours(null)
            setError(null)
            setSuccess('Cours mis à jour avec succès.')
        }
    }

    const renderEditForm = () => (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
            <div className="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto border border-indigo-100">
                <h2 className="text-2xl font-bold text-gray-800 mb-6">Modifier le Cours</h2>
                <form onSubmit={handleUpdateCours} className="space-y-4">
                    {/* Nom */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Nom du cours</label>
                        <input
                            type="text"
                            value={editingCours?.nom || ''}
                            onChange={(e) => setEditingCours(editingCours ? { ...editingCours, nom: e.target.value } : null)}
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            placeholder="Nom du cours"
                            required
                        />
                    </div>
                    {/* Niveau */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Niveau</label>
                        <select
                            value={editingCours?.niveau || ''}
                            onChange={(e) => setEditingCours(editingCours ? { ...editingCours, niveau: e.target.value } : null)}
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            required
                        >
                            <option value="">Sélectionnez le niveau</option>
                            {NIVEAUX.map((niveau) => (
                                <option key={niveau} value={niveau}>
                                    {niveau}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="flex justify-end space-x-4 pt-4">
                        <button type="button" onClick={() => setEditingCours(null)} className="px-6 py-2 border rounded-lg text-gray-700 bg-gray-100 hover:bg-gray-200">
                            Annuler
                        </button>
                        <button type="submit" className="px-6 py-2 border rounded-lg text-white bg-indigo-600 hover:bg-indigo-700">
                            Mettre à jour
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 to-indigo-100 p-4 sm:p-6 lg:p-8">
            <div className="max-w-7xl mx-auto">
                <div className="flex justify-between items-center mb-8">
                    <div className="flex items-center">
                        <FaBook className="text-3xl text-indigo-500 mr-4" />
                        <h1 className="text-4xl font-bold text-gray-800">Gestion des Cours</h1>
                    </div>
                    <div className="flex items-center gap-4">
                        <input
                            type="file"
                            accept=".xlsx, .xls"
                            onChange={handleImportExcel}
                            className="hidden"
                            id="excel-upload"
                        />
                        <label
                            htmlFor="excel-upload"
                            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 cursor-pointer"
                        >
                            <FaFileExcel />
                            Importer
                        </label>
                        <Link href="/" className="flex items-center text-indigo-600 hover:text-indigo-800">
                            <FaArrowLeft className="mr-2"/>
                            Retour &agrave; l&apos;accueil
                        </Link>
                    </div>
                </div>

                {error && <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-6 rounded-lg"><p>{error}</p></div>}
                {success && <div className="bg-green-100 border-l-4 border-green-500 text-green-700 p-4 mb-6 rounded-lg"><p>{success}</p></div>}
                
                {/* Formulaire d'ajout */}
                <div className="bg-white p-6 rounded-2xl shadow-xl mb-8 border border-indigo-100">
                    <h2 className="text-2xl font-semibold text-gray-700 mb-4">Ajouter un cours</h2>
                    <form onSubmit={handleAddCours} className="flex gap-4">
                        <input
                            type="text"
                            value={newCours.nom}
                            onChange={(e) => setNewCours({ ...newCours, nom: e.target.value })}
                            className="flex-1 p-2 border rounded bg-gray-50"
                            placeholder="Nom du cours"
                            required
                        />
                        <select
                            value={newCours.niveau}
                            onChange={(e) => setNewCours({ ...newCours, niveau: e.target.value })}
                            className="flex-1 p-2 border rounded bg-gray-50"
                            required
                        >
                            <option value="">Sélectionnez le niveau</option>
                            {NIVEAUX.map((niveau) => (
                                <option key={niveau} value={niveau}>
                                    {niveau}
                                </option>
                            ))}
                        </select>
                        <button type="submit" className="bg-indigo-600 text-white p-2 rounded hover:bg-indigo-700 flex items-center">
                            <FaPlus className="mr-2"/> Ajouter Cours
                        </button>
                    </form>
                </div>

                {/* Liste des cours */}
                <div className="bg-white shadow-xl rounded-2xl overflow-hidden border border-indigo-100">
                    {loading ? <p className="p-4 text-center">Chargement...</p> : (
                        <table className="min-w-full leading-normal">
                            <thead>
                                <tr>
                                    <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Nom du Cours</th>
                                    <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Niveau</th>
                                    <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {cours.map(c => (
                                    <tr key={c.id} className="hover:bg-gray-50">
                                        <td className="px-5 py-4 border-b border-gray-200 text-sm">{c.nom}</td>
                                        <td className="px-5 py-4 border-b border-gray-200 text-sm text-center">{c.niveau}</td>
                                        <td className="px-5 py-4 border-b border-gray-200 text-sm text-center">
                                            <div className="flex justify-center items-center space-x-3">
                                                <button onClick={() => setEditingCours(c)} className="text-yellow-600 hover:text-yellow-800"><FaPencilAlt /></button>
                                                <button onClick={() => handleDeleteCours(c.id)} className="text-red-600 hover:text-red-800"><FaTrash /></button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                {editingCours && renderEditForm()}
            </div>
        </div>
    )
}
