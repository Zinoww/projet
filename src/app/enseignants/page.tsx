'use client'

import { useState, useEffect, FormEvent, ChangeEvent } from 'react'
import { supabase } from '@/src/lib/supabaseClient'
import Link from 'next/link'
import { FaChalkboardTeacher, FaPlus, FaTrash, FaPencilAlt, FaArrowLeft, FaFileExcel } from 'react-icons/fa'
import * as XLSX from 'xlsx'

interface Enseignant {
    id: string
    nom: string
    email: string | null
    heures_travail: number | null
    disponibilites: unknown | null
}

interface ExcelRow {
    nom: string;
    email?: string;
    heures_travail?: number;
    disponibilites?: string; // JSON string
}

export default function EnseignantsPage() {
    const [enseignants, setEnseignants] = useState<Enseignant[]>([])
    const [newEnseignant, setNewEnseignant] = useState({ nom: '', email: '', heures_travail: '', disponibilites: '' })
    const [editingEnseignant, setEditingEnseignant] = useState<Enseignant | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)

    const fetchEnseignants = async () => {
        setLoading(true)
        const { data, error } = await supabase.from('enseignants').select('*').order('nom', { ascending: true })
        if (error) {
            setError('Impossible de charger les enseignants.')
        } else {
            setEnseignants(data as Enseignant[])
        }
        setLoading(false)
    }

    useEffect(() => {
        fetchEnseignants()
    }, [])

    const handleJsonParse = (jsonString: string) => {
        if (!jsonString) return null
        try {
            return JSON.parse(jsonString)
        } catch {
            return null
        }
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

                const enseignantsToInsert = jsonData.map(row => {
                    if (!row.nom || typeof row.nom !== 'string' || row.nom.trim() === '') {
                        throw new Error('Chaque ligne doit avoir un "nom" valide.');
                    }

                    let disponibilitesJson = null;
                    if (row.disponibilites) {
                        try {
                            disponibilitesJson = JSON.parse(row.disponibilites);
                        } catch {
                            throw new Error(`Format JSON invalide pour les disponibilités de "${row.nom}".`);
                        }
                    }

                    return {
                        nom: row.nom.trim(),
                        email: row.email ? row.email.trim() : null,
                        heures_travail: row.heures_travail ? Number(row.heures_travail) : null,
                        disponibilites: disponibilitesJson,
                    };
                });

                if (enseignantsToInsert.length > 0) {
                    const { error: insertError } = await supabase.from('enseignants').insert(enseignantsToInsert);
                    if (insertError) {
                        throw new Error(insertError.message);
                    }
                    setSuccess(`${enseignantsToInsert.length} enseignant(s) importé(s) avec succès.`);
                    fetchEnseignants();
                } else {
                    setError("Aucune ligne valide à importer.");
                }

            } catch (err: unknown) {
                setError(`Erreur l&apos;importation : ${(err as Error)?.message || 'Inconnue'}`);
            } finally {
                setLoading(false);
                e.target.value = '';
            }
        };
        reader.readAsBinaryString(file);
    };

    const handleAddEnseignant = async (e: FormEvent) => {
        e.preventDefault()
        if (!newEnseignant.nom.trim()) {
            setError('Le nom est obligatoire.')
            return
        }

        const disponibilitesJson = handleJsonParse(newEnseignant.disponibilites)
        if (newEnseignant.disponibilites && !disponibilitesJson) {
            setError('Le format JSON pour les disponibilités est invalide.')
            return
        }

        setError(null)
        setSuccess(null)

        const { data, error } = await supabase.from('enseignants').insert([{
            nom: newEnseignant.nom.trim(),
            email: newEnseignant.email.trim() || null,
            heures_travail: newEnseignant.heures_travail ? parseInt(newEnseignant.heures_travail) : null,
            disponibilites: disponibilitesJson
        }]).select()

        if (error) {
            setError(`Erreur lors de l&apos;ajout: ${error.message}`)
        } else if (data) {
            setEnseignants([...enseignants, ...(data as Enseignant[])])
            setNewEnseignant({ nom: '', email: '', heures_travail: '', disponibilites: '' })
            setSuccess('Enseignant ajouté avec succès.')
        }
    }

    const handleDeleteEnseignant = async (id: string) => {
        if (!confirm('Êtes-vous sûr de vouloir supprimer cet enseignant ?')) return

        const { error } = await supabase.from('enseignants').delete().eq('id', id)
        if (error) {
            setError(`Impossible de supprimer: ${error.message}`)
            setSuccess(null)
        } else {
            setEnseignants(enseignants.filter((en) => en.id !== id))
            setSuccess('Enseignant supprimé.')
            setError(null)
        }
    }

    const startEditing = (enseignant: Enseignant) => {
        setEditingEnseignant({
            ...enseignant,
            disponibilites: enseignant.disponibilites ? JSON.stringify(enseignant.disponibilites, null, 2) : ''
        });
    }

    const handleUpdateEnseignant = async (e: FormEvent) => {
        e.preventDefault()
        if (!editingEnseignant) return

        let disponibilitesJson = editingEnseignant.disponibilites
        if (typeof editingEnseignant.disponibilites === 'string') {
            disponibilitesJson = handleJsonParse(editingEnseignant.disponibilites)
            if (editingEnseignant.disponibilites && !disponibilitesJson) {
                setError('Le format JSON pour les disponibilités est invalide.')
                return
            }
        }

        const { data, error } = await supabase
            .from('enseignants')
            .update({
                nom: editingEnseignant.nom.trim(),
                email: editingEnseignant.email?.trim() || null,
                heures_travail: editingEnseignant.heures_travail ? Number(editingEnseignant.heures_travail) : null,
                disponibilites: disponibilitesJson
            })
            .eq('id', editingEnseignant.id)
            .select()

        if (error) {
            setError(`Erreur lors de la mise à jour: ${error.message}`)
            setSuccess(null)
        } else if (data) {
            setEnseignants(enseignants.map(en => en.id === editingEnseignant.id ? (data[0] as Enseignant) : en))
            setEditingEnseignant(null)
            setSuccess('Enseignant mis à jour.')
            setError(null)
        }
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 to-indigo-100">
            <div className="container mx-auto px-4 sm:px-8 py-8">
                <div className="flex justify-between items-center mb-8">
                    <div className="flex items-center">
                        <FaChalkboardTeacher className="text-3xl text-indigo-500 mr-4" />
                        <h1 className="text-4xl font-bold text-gray-800">Gestion des Enseignants</h1>
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
                            <FaArrowLeft className="mr-2" />
                            Retour &agrave; l&#39;accueil
                        </Link>
                    </div>
                </div>

                {error && <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-6" role="alert"><p>{error}</p></div>}
                {success && <div className="bg-green-100 border-l-4 border-green-500 text-green-700 p-4 mb-6" role="alert"><p>{success}</p></div>}

                <div className="bg-white p-6 rounded-lg shadow-md mb-8">
                    <h2 className="text-2xl font-semibold text-gray-700 mb-4">Ajouter un enseignant</h2>
                    <form onSubmit={handleAddEnseignant} className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <input type="text" value={newEnseignant.nom} onChange={(e) => setNewEnseignant({ ...newEnseignant, nom: e.target.value })} placeholder="Nom et prénom" className="md:col-span-2 w-full p-2 border rounded-lg" required />
                            <input type="number" value={newEnseignant.heures_travail} onChange={(e) => setNewEnseignant({ ...newEnseignant, heures_travail: e.target.value })} placeholder="Heures de service" className="w-full p-2 border rounded-lg" />
                        </div>
                        <input type="email" value={newEnseignant.email} onChange={(e) => setNewEnseignant({ ...newEnseignant, email: e.target.value })} placeholder="Adresse e-mail" className="w-full p-2 border rounded-lg" />
                        <textarea value={newEnseignant.disponibilites} onChange={(e) => setNewEnseignant({ ...newEnseignant, disponibilites: e.target.value })} placeholder='Indisponibilités (Format JSON), ex: {"Jeudi": true, "Samedi": true}' className="w-full p-2 border rounded-lg font-mono text-sm" rows={3} />
                        <p className="text-xs text-gray-500 mt-1 mb-2">Indiquez uniquement les jours où l’enseignant n’est <b>pas disponible</b>. Exemple : {'{"Jeudi": true, "Samedi": true}'}</p>
                        <button type="submit" className="w-full md:w-auto bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 flex items-center justify-center">
                            <FaPlus className="mr-2" /> Ajouter
                        </button>
                    </form>
                </div>

                <div className="bg-white shadow-md rounded-lg overflow-hidden">
                    {loading ? <p className="p-4 text-center">Chargement...</p> : (
                        <table className="min-w-full leading-normal">
                            <thead>
                                <tr>
                                    <th className="px-5 py-3 border-b-2 bg-gray-100 text-left text-xs font-semibold uppercase">Nom</th>
                                    <th className="px-5 py-3 border-b-2 bg-gray-100 text-left text-xs font-semibold uppercase">Email</th>
                                    <th className="px-5 py-3 border-b-2 bg-gray-100 text-left text-xs font-semibold uppercase">Heures</th>
                                    <th className="px-5 py-3 border-b-2 bg-gray-100 text-right text-xs font-semibold uppercase">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {enseignants.map((enseignant) => (
                                    <tr key={enseignant.id} className="hover:bg-gray-50">
                                        {editingEnseignant?.id === enseignant.id ? (
                                            <td colSpan={4} className="px-5 py-4 border-b">
                                                <form onSubmit={handleUpdateEnseignant} className="space-y-3">
                                                    <div className="grid grid-cols-3 gap-3">
                                                        <input type="text" value={editingEnseignant.nom} onChange={(e) => setEditingEnseignant({ ...editingEnseignant, nom: e.target.value })} className="col-span-2 w-full p-1 border rounded" required />
                                                        <input type="number" value={editingEnseignant.heures_travail || ''} onChange={(e) => setEditingEnseignant({ ...editingEnseignant, heures_travail: Number(e.target.value) })} className="w-full p-1 border rounded" />
                                                    </div>
                                                    <input type="email" value={editingEnseignant.email || ''} onChange={(e) => setEditingEnseignant({ ...editingEnseignant, email: e.target.value })} className="w-full p-1 border rounded" />
                                                    <textarea value={editingEnseignant.disponibilites as string} onChange={(e) => setEditingEnseignant({ ...editingEnseignant, disponibilites: e.target.value })} placeholder='Indisponibilités (Format JSON), ex: {"Jeudi": true, "Samedi": true}' className="w-full p-1 border rounded font-mono text-sm" rows={4} />
                                                    <p className="text-xs text-gray-500 mt-1 mb-2">Indiquez uniquement les jours où l’enseignant n’est <b>pas disponible</b>. Exemple : {'{"Jeudi": true, "Samedi": true}'}</p>
                                                    <div className="flex gap-2 justify-end">
                                                        <button type="submit" className="px-3 py-1 rounded bg-green-500 text-white">Sauver</button>
                                                        <button type="button" onClick={() => setEditingEnseignant(null)} className="px-3 py-1 rounded bg-gray-200">Annuler</button>
                                                    </div>
                                                </form>
                                            </td>
                                        ) : (
                                            <>
                                                <td className="px-5 py-4 border-b text-sm"><p className="font-semibold">{enseignant.nom}</p></td>
                                                <td className="px-5 py-4 border-b text-sm">{enseignant.email || 'N/A'}</td>
                                                <td className="px-5 py-4 border-b text-sm">{enseignant.heures_travail ?? 'N/A'}</td>
                                                <td className="px-5 py-4 border-b text-sm text-right">
                                                    <div className="inline-flex space-x-3">
                                                        <button onClick={() => startEditing(enseignant)} className="text-yellow-600 hover:text-yellow-800"><FaPencilAlt /></button>
                                                        <button onClick={() => handleDeleteEnseignant(enseignant.id)} className="text-red-600 hover:text-red-800"><FaTrash /></button>
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
