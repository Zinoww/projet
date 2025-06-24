'use client'

import { useState, useEffect, FormEvent, ChangeEvent } from 'react'
import { supabase } from '@/src/lib/supabaseClient'
import Link from 'next/link'
import { FaUsers, FaPlus, FaTrash, FaPencilAlt, FaArrowLeft, FaFileExcel } from 'react-icons/fa'
import * as XLSX from 'xlsx'

interface Groupe {
    id: string
    nom: string
    niveau: string | null
    specialite: string | null
    section_id: string
    sections: { nom: string, filieres: { nom: string } | null } | null
}

interface Section {
    id: string
    nom: string
}

interface ExcelRow {
    nom: string;
    niveau: string;
    specialite?: string;
    section_nom: string;
}

const NIVEAUX = ['L1', 'L2', 'L3', 'M1', 'M2'];

export default function GroupesPage() {
    const [groupes, setGroupes] = useState<Groupe[]>([])
    const [sections, setSections] = useState<Section[]>([])
    const [newGroupe, setNewGroupe] = useState({ nom: '', niveau: '', specialite: '', section_id: '' })
    const [editingGroupe, setEditingGroupe] = useState<Groupe | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)

    const fetchPageData = async () => {
        setLoading(true)
        const { data: groupesData, error: groupesError } = await supabase
            .from('groupes')
            .select('*, sections(*, filieres(nom))')
            .order('nom', { ascending: true })

        const { data: sectionsData, error: sectionsError } = await supabase
            .from('sections')
            .select('*')
            .order('nom', { ascending: true })

        if (groupesError || sectionsError) {
            setError('Impossible de charger les données.')
        } else {
            setGroupes(groupesData as Groupe[])
            setSections(sectionsData as Section[])
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

        const { data: sectionsData, error: sectionsError } = await supabase.from('sections').select('id, nom');
        if (sectionsError) {
            setError('Impossible de récupérer les sections pour la validation.');
            setLoading(false);
            return;
        }
        const sectionNameToIdMap = new Map(sectionsData.map(s => [s.nom.trim().toLowerCase(), s.id]));

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const data = event.target?.result;
                const workbook = XLSX.read(data, { type: 'binary' });
                const sheetName = workbook.SheetNames[0];
                const sheet = workbook.Sheets[sheetName];
                const jsonData = XLSX.utils.sheet_to_json<ExcelRow>(sheet);

                const groupesToInsert = jsonData.map(row => {
                    if (!row.nom || !row.section_nom) {
                        throw new Error(`Ligne invalide: 'nom' et 'section_nom' sont requis.`);
                    }
                    if (row.niveau && !NIVEAUX.includes(row.niveau.trim())) {
                        throw new Error(`Le niveau '${row.niveau}' n'est pas valide. Utilisez L1, L2, L3, M1 ou M2.`);
                    }
                    const sectionId = sectionNameToIdMap.get(row.section_nom.trim().toLowerCase());
                    if (!sectionId) {
                        throw new Error(`La section "${row.section_nom}" pour le groupe "${row.nom}" n'existe pas.`);
                    }
                    return {
                        nom: row.nom.trim(),
                        niveau: row.niveau ? row.niveau.trim() : null,
                        specialite: row.specialite ? row.specialite.trim() : null,
                        section_id: sectionId,
                    };
                });

                if (groupesToInsert.length > 0) {
                    const { error: insertError } = await supabase.from('groupes').insert(groupesToInsert);
                    if (insertError) {
                        throw new Error(insertError.message);
                    }
                    setSuccess(`${groupesToInsert.length} groupe(s) importé(s) avec succès.`);
                    fetchPageData();
                } else {
                    setError("Aucune ligne valide à importer.");
                }

            } catch (err: any) {
                setError(`Erreur d'importation : ${err.message}`);
            } finally {
                setLoading(false);
                e.target.value = '';
            }
        };
        reader.readAsBinaryString(file);
    };

    const handleAddGroupe = async (e: FormEvent) => {
        e.preventDefault()
        if (!newGroupe.nom.trim() || !newGroupe.section_id) {
            setError('Le nom et la section sont obligatoires.')
            return
        }
        setError(null)
        setSuccess(null)

        const { data, error } = await supabase
            .from('groupes')
            .insert([{ 
                nom: newGroupe.nom.trim(), 
                niveau: newGroupe.niveau ? newGroupe.niveau.trim() : null,
                specialite: newGroupe.specialite.trim() || null,
                section_id: newGroupe.section_id 
            }])
            .select('*, sections(*, filieres(nom))')
        
        if (error) {
            setError(`Erreur lors de l'ajout: ${error.message}`)
        } else if (data) {
            setGroupes([...groupes, ...(data as Groupe[])])
            setNewGroupe({ nom: '', niveau: '', specialite: '', section_id: '' })
            setSuccess('Groupe ajouté avec succès.')
        }
    }

    const handleDeleteGroupe = async (id: string) => {
        if (!confirm('Êtes-vous sûr de vouloir supprimer ce groupe ?')) return

        const { error } = await supabase.from('groupes').delete().eq('id', id)
        if (error) {
            setError(`Impossible de supprimer: ${error.message}`)
            setSuccess(null)
        } else {
            setGroupes(groupes.filter((g) => g.id !== id))
            setSuccess('Groupe supprimé.')
            setError(null)
        }
    }

    const handleUpdateGroupe = async (e: FormEvent) => {
        e.preventDefault()
        if (!editingGroupe) return

        const { data, error } = await supabase
            .from('groupes')
            .update({ 
                nom: editingGroupe.nom.trim(), 
                niveau: editingGroupe.niveau ? editingGroupe.niveau.trim() : null,
                specialite: editingGroupe.specialite?.trim() || null,
                section_id: editingGroupe.section_id
            })
            .eq('id', editingGroupe.id)
            .select('*, sections(*, filieres(nom))')

        if (error) {
            setError(`Erreur lors de la mise à jour: ${error.message}`)
            setSuccess(null)
        } else if (data) {
            setGroupes(groupes.map(s => s.id === editingGroupe.id ? (data[0] as Groupe) : s))
            setEditingGroupe(null)
            setSuccess('Groupe mis à jour.')
            setError(null)
        }
    }

    return (
        <div className="container mx-auto px-4 sm:px-8 py-8">
             <div className="flex justify-between items-center mb-8">
                <div className="flex items-center">
                    <FaUsers className="text-3xl text-indigo-500 mr-4" />
                    <h1 className="text-4xl font-bold text-gray-800">Gestion des Groupes</h1>
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
                        Retour à l'accueil
                    </Link>
                </div>
            </div>

            {error && <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-6" role="alert"><p>{error}</p></div>}
            {success && <div className="bg-green-100 border-l-4 border-green-500 text-green-700 p-4 mb-6" role="alert"><p>{success}</p></div>}
            
            <div className="bg-white p-6 rounded-lg shadow-md mb-8">
                <h2 className="text-2xl font-semibold text-gray-700 mb-4">Ajouter un groupe</h2>
                <form onSubmit={handleAddGroupe} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <input type="text" value={newGroupe.nom} onChange={(e) => setNewGroupe({ ...newGroupe, nom: e.target.value })} placeholder="Nom (ex: G1)" className="w-full p-2 border rounded-lg" required />
                        <input
                            type="text"
                            list="niveaux-list"
                            value={newGroupe.niveau}
                            onChange={(e) => setNewGroupe({ ...newGroupe, niveau: e.target.value })}
                            placeholder="Niveau (ex: L1)"
                            className="w-full p-2 border rounded-lg"
                            required
                            pattern="L[1-3]|M[1-2]"
                        />
                        <datalist id="niveaux-list">
                            {NIVEAUX.map(niv => <option key={niv} value={niv} />)}
                        </datalist>
                        <input type="text" value={newGroupe.specialite} onChange={(e) => setNewGroupe({ ...newGroupe, specialite: e.target.value })} placeholder="Spécialité" className="w-full p-2 border rounded-lg" />
                        <select value={newGroupe.section_id} onChange={(e) => setNewGroupe({ ...newGroupe, section_id: e.target.value })} className="w-full p-2 border rounded-lg" required>
                            <option value="">-- Choisir une section --</option>
                            {sections.map(s => <option key={s.id} value={s.id}>{s.nom}</option>)}
                        </select>
                    </div>
                    <button type="submit" className="w-full md:w-auto bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 flex items-center justify-center">
                        <FaPlus className="mr-2"/> Ajouter
                    </button>
                </form>
            </div>

            <div className="bg-white shadow-md rounded-lg overflow-hidden">
                {loading ? <p className="p-4 text-center">Chargement...</p> : (
                    <table className="min-w-full leading-normal">
                        <thead>
                            <tr>
                                <th className="px-5 py-3 border-b-2 bg-gray-100 text-left text-xs font-semibold uppercase">Nom</th>
                                <th className="px-5 py-3 border-b-2 bg-gray-100 text-left text-xs font-semibold uppercase">Niveau</th>
                                <th className="px-5 py-3 border-b-2 bg-gray-100 text-left text-xs font-semibold uppercase">Spécialité</th>
                                <th className="px-5 py-3 border-b-2 bg-gray-100 text-left text-xs font-semibold uppercase">Section</th>
                                <th className="px-5 py-3 border-b-2 bg-gray-100 text-left text-xs font-semibold uppercase">Filière</th>
                                <th className="px-5 py-3 border-b-2 bg-gray-100 text-right text-xs font-semibold uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {groupes.map((groupe) => (
                                <tr key={groupe.id} className="hover:bg-gray-50">
                                    {editingGroupe?.id === groupe.id ? (
                                        <td colSpan={6} className="px-5 py-4 border-b">
                                             <form onSubmit={handleUpdateGroupe} className="grid grid-cols-5 gap-3 items-center">
                                                <input type="text" value={editingGroupe.nom} onChange={(e) => setEditingGroupe({ ...editingGroupe, nom: e.target.value })} className="w-full p-1 border rounded" />
                                                <input
                                                    type="text"
                                                    list="niveaux-list"
                                                    value={editingGroupe.niveau || ''}
                                                    onChange={(e) => setEditingGroupe({ ...editingGroupe, niveau: e.target.value })}
                                                    placeholder="Niveau (ex: L1)"
                                                    className="w-full p-1 border rounded"
                                                    required
                                                    pattern="L[1-3]|M[1-2]"
                                                />
                                                <datalist id="niveaux-list">
                                                    {NIVEAUX.map(niv => <option key={niv} value={niv} />)}
                                                </datalist>
                                                <input type="text" value={editingGroupe.specialite || ''} onChange={(e) => setEditingGroupe({ ...editingGroupe, specialite: e.target.value })} className="w-full p-1 border rounded" />
                                                <select value={editingGroupe.section_id} onChange={(e) => setEditingGroupe({ ...editingGroupe, section_id: e.target.value })} className="w-full p-1 border rounded">
                                                     {sections.map(s => <option key={s.id} value={s.id}>{s.nom}</option>)}
                                                </select>
                                                <div className="flex gap-2 justify-end">
                                                    <button type="submit" className="px-3 py-1 rounded bg-green-500 text-white">Sauver</button>
                                                    <button type="button" onClick={() => setEditingGroupe(null)} className="px-3 py-1 rounded bg-gray-200">Annuler</button>
                                                </div>
                                            </form>
                                        </td>
                                    ) : (
                                        <>
                                            <td className="px-5 py-4 border-b text-sm"><p className="font-semibold">{groupe.nom}</p></td>
                                            <td className="px-5 py-4 border-b text-sm">{groupe.niveau || 'N/A'}</td>
                                            <td className="px-5 py-4 border-b text-sm">{groupe.specialite || 'N/A'}</td>
                                            <td className="px-5 py-4 border-b text-sm">{groupe.sections?.nom || 'N/A'}</td>
                                            <td className="px-5 py-4 border-b text-sm">{groupe.sections?.filieres?.nom || 'N/A'}</td>
                                            <td className="px-5 py-4 border-b text-sm text-right">
                                                <div className="inline-flex space-x-3">
                                                    <button onClick={() => setEditingGroupe(groupe)} className="text-yellow-600 hover:text-yellow-800"><FaPencilAlt /></button>
                                                    <button onClick={() => handleDeleteGroupe(groupe.id)} className="text-red-600 hover:text-red-800"><FaTrash /></button>
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
    )
}