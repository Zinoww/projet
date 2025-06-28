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

interface ExcelRow {
    nom: string;
}

export default function FilieresPage() {
    const [filieres, setFilieres] = useState<Filiere[]>([])
    const [newFiliere, setNewFiliere] = useState({ nom: '' })
    const [editingFiliere, setEditingFiliere] = useState<Filiere | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)

    const fetchFilieres = async () => {
        setLoading(true)
        const { data, error } = await supabase.from('filieres').select('*').order('nom', { ascending: true })
        if (error) {
            setError('Impossible de charger les filières.')
        } else {
            setFilieres(data as Filiere[])
        }
        setLoading(false)
    }

    useEffect(() => {
        fetchFilieres()
    }, [])
    
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

                const filieresToInsert = jsonData.map(row => {
                    if (!row.nom || typeof row.nom !== 'string' || row.nom.trim() === '') {
                        throw new Error('Chaque ligne doit avoir un "nom" valide.');
                    }
                    return { nom: row.nom.trim() };
                });

                if (filieresToInsert.length > 0) {
                    const { error: insertError } = await supabase.from('filieres').insert(filieresToInsert);
                    if (insertError) {
                        throw new Error(insertError.message);
                    }
                    setSuccess(`${filieresToInsert.length} filière(s) importée(s) avec succès.`);
                    fetchFilieres(); // Rafraîchir la liste
                } else {
                    setError("Le fichier Excel ne contient aucune ligne valide à importer.");
                }

            } catch (err: unknown) {
                setError(`Erreur lors de l&apos;importation : ${(err as Error)?.message || 'Inconnue'}`);
            } finally {
                setLoading(false);
                e.target.value = ''; 
            }
        };
        reader.readAsBinaryString(file);
    };

    const handleAddFiliere = async (e: FormEvent) => {
        e.preventDefault()
        if (!newFiliere.nom.trim()) {
            setError('Le nom est obligatoire.')
            return
        }
        
        setError(null);
        setSuccess(null);

        const { data, error } = await supabase.from('filieres').insert([{ nom: newFiliere.nom.trim() }]).select()
        if (error) {
            setError(`Erreur lors de l&apos;ajout: ${error.message}`)
        } else if (data) {
            setFilieres([...filieres, ...(data as Filiere[])])
            setNewFiliere({ nom: '' })
            setSuccess('Filière ajoutée avec succès.')
        }
    }

    const handleDeleteFiliere = async (id: string) => {
        if (!confirm('Êtes-vous sûr de vouloir supprimer cette filière ? Toutes les sections et groupes associés seront aussi supprimés.')) return

        const { error } = await supabase.from('filieres').delete().eq('id', id)
        if (error) {
            setError(`Impossible de supprimer: ${error.message}`)
            setSuccess(null)
        } else {
            setFilieres(filieres.filter((f) => f.id !== id))
            setSuccess('Filière supprimée.')
            setError(null)
        }
    }

    const handleUpdateFiliere = async (e: FormEvent) => {
        e.preventDefault()
        if (!editingFiliere || !editingFiliere.nom.trim()) return

        const { data, error } = await supabase.from('filieres').update({ nom: editingFiliere.nom.trim() }).eq('id', editingFiliere.id).select()
        if (error) {
            setError(`Erreur lors de la mise à jour: ${error.message}`)
            setSuccess(null)
        } else if (data) {
            setFilieres(filieres.map(f => f.id === editingFiliere.id ? (data[0] as Filiere) : f))
            setEditingFiliere(null)
            setSuccess('Filière mise à jour.')
            setError(null)
        }
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 to-indigo-100">
            <div className="container mx-auto px-4 sm:px-8 py-8">
                <div className="flex justify-between items-center mb-8">
                    <div className="flex items-center">
                        <FaUniversity className="text-3xl text-indigo-500 mr-4" />
                        <h1 className="text-4xl font-bold text-gray-800">Gestion des Filières</h1>
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
                            Retour &agrave; l&#39;accueil
                        </Link>
                    </div>
                </div>

                {error && <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-6" role="alert"><p>{error}</p></div>}
                {success && <div className="bg-green-100 border-l-4 border-green-500 text-green-700 p-4 mb-6" role="alert"><p>{success}</p></div>}

                <div className="bg-white p-6 rounded-lg shadow-md mb-8">
                    <h2 className="text-2xl font-semibold text-gray-700 mb-4">Ajouter une filière</h2>
                    <form onSubmit={handleAddFiliere} className="flex items-center gap-4">
                        <input
                            type="text"
                            value={newFiliere.nom}
                            onChange={(e) => setNewFiliere({ nom: e.target.value })}
                            placeholder="Nom de la nouvelle filière"
                            className="w-full p-2 border rounded-lg"
                            required
                        />
                        <button type="submit" className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 flex items-center">
                            <FaPlus className="mr-2"/> Ajouter
                        </button>
                    </form>
                </div>

                <div className="bg-white shadow-md rounded-lg overflow-hidden">
                    {loading ? <p className="p-4 text-center">Chargement...</p> : (
                        <table className="min-w-full leading-normal">
                            <thead>
                                <tr>
                                    <th className="px-5 py-3 border-b-2 bg-gray-100 text-left text-xs font-semibold uppercase">Nom de la Filière</th>
                                    <th className="px-5 py-3 border-b-2 bg-gray-100 text-right text-xs font-semibold uppercase">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filieres.map((filiere) => (
                                    <tr key={filiere.id} className="hover:bg-gray-50">
                                        <td className="px-5 py-4 border-b text-sm">
                                            {editingFiliere?.id === filiere.id ? (
                                                <form onSubmit={handleUpdateFiliere} className="flex gap-2">
                                                    <input
                                                        type="text"
                                                        value={editingFiliere.nom}
                                                        onChange={(e) => setEditingFiliere({ ...editingFiliere, nom: e.target.value })}
                                                        className="flex-1 p-1 border rounded"
                                                        required
                                                    />
                                                    <button type="submit" className="px-3 py-1 bg-green-500 text-white rounded">Sauver</button>
                                                    <button type="button" onClick={() => setEditingFiliere(null)} className="px-3 py-1 bg-gray-200 rounded">Annuler</button>
                                                </form>
                                            ) : (
                                                <p className="font-semibold">{filiere.nom}</p>
                                            )}
                                        </td>
                                        <td className="px-5 py-4 border-b text-sm text-right">
                                            <div className="inline-flex space-x-3">
                                                <button onClick={() => setEditingFiliere(filiere)} className="text-yellow-600 hover:text-yellow-800"><FaPencilAlt /></button>
                                                <button onClick={() => handleDeleteFiliere(filiere.id)} className="text-red-600 hover:text-red-800"><FaTrash /></button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    )
} 