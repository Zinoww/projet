'use client'

import { useState, useEffect, FormEvent, ChangeEvent } from 'react'
import { supabase } from '@/src/lib/supabaseClient'
import Link from 'next/link'
import { FaLayerGroup, FaPlus, FaTrash, FaPencilAlt, FaArrowLeft, FaFileExcel } from 'react-icons/fa'
import * as XLSX from 'xlsx'

interface Section {
    id: string
    nom: string
    filiere_id: string
    filieres: { nom: string } | null
}

interface Filiere {
    id: string
    nom: string
}

interface ExcelRow {
    nom: string;
    filiere_nom: string;
}

export default function SectionsPage() {
    const [sections, setSections] = useState<Section[]>([])
    const [filieres, setFilieres] = useState<Filiere[]>([])
    const [newSection, setNewSection] = useState({ nom: '', filiere_id: '' })
    const [editingSection, setEditingSection] = useState<Section | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)

    const fetchPageData = async () => {
        setLoading(true)
        const { data: sectionsData, error: sectionsError } = await supabase
            .from('sections')
            .select('*, filieres(nom)')
            .order('nom', { ascending: true })
        
        const { data: filieresData, error: filieresError } = await supabase
            .from('filieres')
            .select('*')
            .order('nom', { ascending: true })

        if (sectionsError || filieresError) {
            setError('Impossible de charger les données.')
        } else {
            setSections(sectionsData as Section[])
            setFilieres(filieresData as Filiere[])
        }
        setLoading(false)
    }

    useEffect(() => {
        fetchPageData()
    }, [])
    
    const handleImportExcel = async (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setLoading(true);
        setError(null);
        setSuccess(null);

        // 1. Créer une map des noms de filières vers leurs IDs
        const { data: filieresData, error: filieresError } = await supabase.from('filieres').select('id, nom');
        if (filieresError) {
            setError('Impossible de récupérer les filières pour la validation.');
            setLoading(false);
            return;
        }
        const filiereNameToIdMap = new Map(filieresData.map(f => [f.nom.toLowerCase(), f.id]));

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const data = event.target?.result;
                const workbook = XLSX.read(data, { type: 'binary' });
                const sheetName = workbook.SheetNames[0];
                const sheet = workbook.Sheets[sheetName];
                const jsonData = XLSX.utils.sheet_to_json<ExcelRow>(sheet);

                const sectionsToInsert = jsonData.map(row => {
                    if (!row.nom || !row.filiere_nom) {
                        throw new Error(`La ligne pour "${row.nom || 'N/A'}" est incomplète. Les colonnes 'nom' et 'filiere_nom' sont requises.`);
                    }

                    const filiereId = filiereNameToIdMap.get(row.filiere_nom.trim().toLowerCase());
                    if (!filiereId) {
                        throw new Error(`La filière "${row.filiere_nom}" pour la section "${row.nom}" n&apos;a pas été trouvée.`);
                    }

                    return { 
                        nom: row.nom.trim(),
                        filiere_id: filiereId,
                    };
                });

                if (sectionsToInsert.length > 0) {
                    const { error: insertError } = await supabase.from('sections').insert(sectionsToInsert);
                    if (insertError) {
                        throw new Error(insertError.message);
                    }
                    setSuccess(`${sectionsToInsert.length} section(s) importée(s) avec succès.`);
                    fetchPageData(); // Rafraîchir la liste
                } else {
                    setError("Le fichier Excel ne contient aucune ligne valide à importer.");
                }

            } catch (err: unknown) {
                const errorMessage = err instanceof Error ? err.message : 'Erreur inconnue';
                setError(`Erreur d&apos;importation : ${errorMessage}`);
            } finally {
                setLoading(false);
                e.target.value = '';
            }
        };
        reader.readAsBinaryString(file);
    };

    const handleAddSection = async (e: FormEvent) => {
        e.preventDefault()
        if (!newSection.nom.trim() || !newSection.filiere_id) {
            setError('Le nom et la filière sont obligatoires.')
            return
        }
        setError(null)
        setSuccess(null)

        const { data, error } = await supabase
            .from('sections')
            .insert([{ nom: newSection.nom.trim(), filiere_id: newSection.filiere_id }])
            .select('*, filieres(nom)')
        
        if (error) {
            setError(`Erreur lors de l&apos;ajout: ${error.message}`)
        } else if (data) {
            setSections([...sections, ...(data as Section[])])
            setNewSection({ nom: '', filiere_id: '' })
            setSuccess('Section ajoutée avec succès.')
        }
    }

    const handleDeleteSection = async (id: string) => {
        if (!confirm('Êtes-vous sûr de vouloir supprimer cette section ? Tous les groupes associés seront aussi supprimés.')) return

        const { error } = await supabase.from('sections').delete().eq('id', id)
        if (error) {
            setError(`Impossible de supprimer: ${error.message}`)
            setSuccess(null)
        } else {
            setSections(sections.filter((s) => s.id !== id))
            setSuccess('Section supprimée.')
            setError(null)
        }
    }

    const handleUpdateSection = async (e: FormEvent) => {
        e.preventDefault()
        if (!editingSection || !editingSection.nom.trim() || !editingSection.filiere_id) return

        const { data, error } = await supabase
            .from('sections')
            .update({ nom: editingSection.nom.trim(), filiere_id: editingSection.filiere_id })
            .eq('id', editingSection.id)
            .select('*, filieres(nom)')

        if (error) {
            setError(`Erreur lors de la mise à jour: ${error.message}`)
            setSuccess(null)
        } else if (data) {
            setSections(sections.map(s => s.id === editingSection.id ? (data[0] as Section) : s))
            setEditingSection(null)
            setSuccess('Section mise à jour.')
            setError(null)
        }
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 to-indigo-100">
            <div className="container mx-auto px-4 sm:px-8 py-8">
                <div className="flex justify-between items-center mb-8">
                    <div className="flex items-center">
                        <FaLayerGroup className="text-3xl text-indigo-500 mr-4" />
                        <h1 className="text-4xl font-bold text-gray-800">Gestion des Sections</h1>
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
                    <h2 className="text-2xl font-semibold text-gray-700 mb-4">Ajouter une section</h2>
                    <form onSubmit={handleAddSection} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                        <select
                            value={newSection.filiere_id}
                            onChange={(e) => setNewSection({ ...newSection, filiere_id: e.target.value })}
                            className="w-full p-2 border rounded-lg md:col-span-1"
                            required
                        >
                            <option value="">-- Choisir une filière --</option>
                            {filieres.map(f => <option key={f.id} value={f.id}>{f.nom}</option>)}
                        </select>
                        <input
                            type="text"
                            value={newSection.nom}
                            onChange={(e) => setNewSection({ ...newSection, nom: e.target.value })}
                            placeholder="Nom de la nouvelle section"
                            className="w-full p-2 border rounded-lg md:col-span-1"
                            required
                        />
                        <button type="submit" className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 flex items-center justify-center md:col-span-1">
                            <FaPlus className="mr-2"/> Ajouter
                        </button>
                    </form>
                </div>

                <div className="bg-white shadow-md rounded-lg overflow-hidden">
                     {loading ? <p className="p-4 text-center">Chargement...</p> : (
                        <table className="min-w-full leading-normal">
                            <thead>
                                <tr>
                                    <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                        Filière
                                    </th>
                                    <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                        Nom de la Section
                                    </th>
                                    <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {sections.map((section) => (
                                    <tr key={section.id} className="hover:bg-gray-50">
                                        {editingSection?.id === section.id ? (
                                            <td colSpan={3} className="px-5 py-4 border-b">
                                                 <form onSubmit={handleUpdateSection} className="grid grid-cols-4 gap-3 items-center">
                                                     <select
                                                        value={editingSection.filiere_id}
                                                        onChange={(e) => setEditingSection({ ...editingSection, filiere_id: e.target.value })}
                                                        className="w-full p-1 border rounded"
                                                    >
                                                        {filieres.map(f => <option key={f.id} value={f.id}>{f.nom}</option>)}
                                                    </select>
                                                    <input
                                                        type="text"
                                                        value={editingSection.nom}
                                                        onChange={(e) => setEditingSection({ ...editingSection, nom: e.target.value })}
                                                        className="w-full p-1 border rounded"
                                                        autoFocus
                                                    />
                                                    <div className="flex gap-2 justify-end col-span-2">
                                                        <button type="submit" className="px-3 py-1 rounded bg-green-500 text-white">Sauver</button>
                                                        <button type="button" onClick={() => setEditingSection(null)} className="px-3 py-1 rounded bg-gray-200">Annuler</button>
                                                    </div>
                                                </form>
                                            </td>
                                        ) : (
                                            <>
                                                <td className="px-5 py-4 border-b text-sm">
                                                    <p className="font-semibold">{section.filieres?.nom || 'N/A'}</p>
                                                </td>
                                                <td className="px-5 py-4 border-b text-sm">
                                                    <p>{section.nom}</p>
                                                </td>
                                                <td className="px-5 py-4 border-b text-sm text-right">
                                                    <div className="inline-flex space-x-3">
                                                        <button onClick={() => setEditingSection(section)} className="text-yellow-600 hover:text-yellow-800"><FaPencilAlt /></button>
                                                        <button onClick={() => handleDeleteSection(section.id)} className="text-red-600 hover:text-red-800"><FaTrash /></button>
                                                    </div>
                                                </td>
                                            </>
                                        )}
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