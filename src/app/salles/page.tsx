'use client'

import { useState, useEffect, FormEvent, ChangeEvent } from 'react'
import { supabase } from '@/src/lib/supabaseClient'
import Link from 'next/link'
import { FaDoorOpen, FaPlus, FaTrash, FaPencilAlt, FaArrowLeft, FaFileExcel } from 'react-icons/fa'
import * as XLSX from 'xlsx'

interface Salle {
    id: string
    nom: string
    capacite: number | null
    type: string | null
    equipement: any | null // Peut être un objet JSON
}

interface ExcelRow {
    nom: string;
    capacite?: number;
    type?: string;
    equipement?: string; // L'équipement sera une chaîne JSON dans l'Excel
}

export default function SallesPage() {
    const [salles, setSalles] = useState<Salle[]>([])
    const [newSalle, setNewSalle] = useState({ nom: '', capacite: '', type: '', equipement: '' })
    const [editingSalle, setEditingSalle] = useState<Salle | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)

    useEffect(() => {
        fetchSalles()
    }, [])

    const fetchSalles = async () => {
        setLoading(true)
        const { data, error } = await supabase.from('salles').select('*').order('nom', { ascending: true })
        if (error) {
            setError('Impossible de charger les salles.')
        } else {
            setSalles(data as Salle[])
        }
        setLoading(false)
    }

    const handleJsonParse = (jsonString: string) => {
        if (!jsonString) return null
        try {
            return JSON.parse(jsonString)
        } catch (e) {
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

                const sallesToInsert = jsonData.map(row => {
                    if (!row.nom || typeof row.nom !== 'string' || row.nom.trim() === '') {
                        throw new Error('Chaque ligne doit avoir un "nom" valide.');
                    }
                    
                    let equipementJson = null;
                    if (row.equipement) {
                        try {
                            equipementJson = JSON.parse(row.equipement);
                        } catch (jsonError) {
                            throw new Error(`Format JSON invalide pour l'équipement de la salle "${row.nom}".`);
                        }
                    }

                    return {
                        nom: row.nom.trim(),
                        capacite: row.capacite ? Number(row.capacite) : null,
                        type: row.type ? row.type.trim() : null,
                        equipement: equipementJson
                    };
                }).filter(Boolean);


                if (sallesToInsert.length > 0) {
                    const { error: insertError } = await supabase.from('salles').insert(sallesToInsert);
                    if (insertError) {
                        throw new Error(insertError.message);
                    }
                    setSuccess(`${sallesToInsert.length} salle(s) importée(s) avec succès.`);
                    fetchSalles(); // Rafraîchir la liste
                } else {
                    setError("Le fichier Excel ne contient aucune ligne valide à importer.");
                }

            } catch (err: any) {
                setError(`Erreur lors de l'importation : ${err.message}`);
            } finally {
                setLoading(false);
                // Réinitialiser l'input pour permettre de re-sélectionner le même fichier
                e.target.value = ''; 
            }
        };
        reader.readAsBinaryString(file);
    };

    const handleAddSalle = async (e: FormEvent) => {
        e.preventDefault()
        if (!newSalle.nom.trim()) {
            setError('Le nom est obligatoire.')
            return
        }

        const equipementJson = handleJsonParse(newSalle.equipement)
        if (newSalle.equipement && !equipementJson) {
            setError('Le format JSON pour l\'équipement est invalide.')
            return
        }

        const { data, error } = await supabase.from('salles').insert([{
            nom: newSalle.nom.trim(),
            capacite: newSalle.capacite ? parseInt(newSalle.capacite) : null,
            type: newSalle.type.trim() || null,
            equipement: equipementJson,
        }]).select()
        
        if (error) {
            setError(`Erreur lors de l'ajout: ${error.message}`)
            setSuccess(null)
        } else if (data) {
            setSalles([...salles, ...(data as Salle[])])
            setNewSalle({ nom: '', capacite: '', type: '', equipement: '' })
            setSuccess('Salle ajoutée avec succès.')
            setError(null)
        }
    }
    
    const handleDeleteSalle = async (id: string) => {
        if (!confirm('Êtes-vous sûr de vouloir supprimer cette salle ?')) return

        const { error } = await supabase.from('salles').delete().eq('id', id)
        if (error) {
            setError(`Impossible de supprimer: ${error.message}`)
            setSuccess(null)
        } else {
            setSalles(salles.filter((s) => s.id !== id))
            setSuccess('Salle supprimée.')
            setError(null)
        }
    }

    const startEditing = (salle: Salle) => {
        setEditingSalle({
            ...salle,
            equipement: salle.equipement ? JSON.stringify(salle.equipement, null, 2) : ''
        });
    }

    const handleUpdateSalle = async (e: FormEvent) => {
        e.preventDefault()
        if (!editingSalle || !editingSalle.nom.trim()) return

        let equipementJson = editingSalle.equipement
        if (typeof editingSalle.equipement === 'string') {
            equipementJson = handleJsonParse(editingSalle.equipement)
            if (editingSalle.equipement && !equipementJson) {
                setError('Le format JSON pour l\'équipement est invalide.')
                return
            }
        }

        const { data, error } = await supabase.from('salles').update({
            nom: editingSalle.nom.trim(),
            capacite: editingSalle.capacite ? Number(editingSalle.capacite) : null,
            type: editingSalle.type?.trim() || null,
            equipement: equipementJson
        }).eq('id', editingSalle.id).select()

        if (error) {
            setError(`Erreur lors de la mise à jour: ${error.message}`)
            setSuccess(null)
        } else if (data) {
            setSalles(salles.map(s => s.id === editingSalle.id ? (data[0] as Salle) : s))
            setEditingSalle(null)
            setSuccess('Salle mise à jour.')
            setError(null)
        }
    }

    const renderEditForm = () => (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
            <div className="bg-white p-8 rounded-lg shadow-2xl w-full max-w-lg">
                <h2 className="text-2xl font-bold text-gray-800 mb-6">Modifier la Salle</h2>
                <form onSubmit={handleUpdateSalle} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <input type="text" value={editingSalle?.nom || ''} onChange={(e) => setEditingSalle({...editingSalle!, nom: e.target.value})}
                            className="md:col-span-2 w-full p-2 border rounded" placeholder="Nom de la salle" required />
                        <input type="number" value={editingSalle?.capacite || ''} onChange={(e) => setEditingSalle({...editingSalle!, capacite: Number(e.target.value)})}
                            className="w-full p-2 border rounded" placeholder="Capacité" />
                    </div>
                    <input type="text" value={editingSalle?.type || ''} onChange={(e) => setEditingSalle({...editingSalle!, type: e.target.value})}
                        className="w-full p-2 border rounded" placeholder="Type de salle (ex: Amphi, Salle TD, Salle Info)" />
                    <textarea value={editingSalle?.equipement || ''} onChange={(e) => setEditingSalle({...editingSalle!, equipement: e.target.value})}
                        className="w-full p-2 border rounded font-mono text-sm" placeholder='Équipement (JSON), ex: {"projecteur": true, "nb_pc": 20}' rows={4} />
                    <div className="flex justify-end gap-4 pt-4">
                        <button type="button" onClick={() => setEditingSalle(null)} className="px-6 py-2 rounded-lg bg-gray-200">Annuler</button>
                        <button type="submit" className="px-6 py-2 rounded-lg text-white bg-indigo-600">Mettre à jour</button>
                    </div>
                </form>
            </div>
        </div>
    )

    return (
        <div className="container mx-auto px-4 sm:px-8 py-8">
            <div className="flex justify-between items-center mb-8">
                <div className="flex items-center">
                    <FaDoorOpen className="text-3xl text-indigo-500 mr-4" />
                    <h1 className="text-4xl font-bold text-gray-800">Gestion des Salles</h1>
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
                <h2 className="text-2xl font-semibold text-gray-700 mb-4">Ajouter une salle</h2>
                <form onSubmit={handleAddSalle} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <input type="text" value={newSalle.nom} onChange={(e) => setNewSalle({...newSalle, nom: e.target.value})}
                            placeholder="Nom de la salle" className="md:col-span-2 w-full p-2 border rounded-lg" required />
                        <input type="number" value={newSalle.capacite} onChange={(e) => setNewSalle({...newSalle, capacite: e.target.value})}
                            placeholder="Capacité" className="w-full p-2 border rounded-lg" />
                    </div>
                    <input type="text" value={newSalle.type} onChange={(e) => setNewSalle({...newSalle, type: e.target.value})}
                        placeholder="Type (ex: Amphi, Salle Info)" className="w-full p-2 border rounded-lg" />
                    <textarea value={newSalle.equipement} onChange={(e) => setNewSalle({...newSalle, equipement: e.target.value})}
                        placeholder='Équipement (Format JSON), ex: {"projecteur": true}' className="w-full p-2 border rounded-lg font-mono text-sm" rows={3}/>
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
                                <th className="px-5 py-3 border-b-2 bg-gray-100 text-left text-xs font-semibold uppercase">Type</th>
                                <th className="px-5 py-3 border-b-2 bg-gray-100 text-left text-xs font-semibold uppercase">Capacité</th>
                                <th className="px-5 py-3 border-b-2 bg-gray-100 text-right text-xs font-semibold uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {salles.map((salle) => (
                                <tr key={salle.id} className="hover:bg-gray-50">
                                    <td className="px-5 py-4 border-b text-sm"><p className="font-semibold">{salle.nom}</p></td>
                                    <td className="px-5 py-4 border-b text-sm">{salle.type || 'N/A'}</td>
                                    <td className="px-5 py-4 border-b text-sm">{salle.capacite ?? 'N/A'}</td>
                                    <td className="px-5 py-4 border-b text-sm text-right">
                                        <div className="inline-flex space-x-3">
                                            <button onClick={() => startEditing(salle)} className="text-yellow-600 hover:text-yellow-800"><FaPencilAlt /></button>
                                            <button onClick={() => handleDeleteSalle(salle.id)} className="text-red-600 hover:text-red-800"><FaTrash /></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {editingSalle && renderEditForm()}
        </div>
    )
}
