'use client'

import { useState, useEffect, FormEvent, ChangeEvent } from 'react'
import { supabase } from '@/src/lib/supabaseClient'
import { FaClipboardList, FaPlus, FaTrash, FaPencilAlt, FaArrowLeft, FaFileExcel } from 'react-icons/fa'
import Link from 'next/link'
import * as XLSX from 'xlsx'

// Interfaces pour les données externes
interface Cour { id: string; nom: string; }
interface TypeSeance { id: string; nom: string; }
interface Groupe { id: string; nom: string; niveau: string | null; }
interface Enseignant { id: string; nom: string; }

// Interface pour une séance (avec les données jointes pour l'affichage)
interface Seance {
  id: string
  duree_minutes: number | null
  cours_id: string
  type_id: string
  groupe_id: string
  enseignant_id: string | null
  cours: { nom: string } | null
  types_seances: { nom: string } | null
  groupes: { nom: string } | null
  enseignants: { nom: string } | null
}

// Interface pour la création/modification de séance
interface SeanceForm {
  cours_id: string
  type_id: string
  groupe_id: string
  enseignant_id: string
  duree_minutes: string
}

interface ExcelRow {
    cours_nom: string;
    type_nom: string;
    groupe_nom: string;
    enseignant_nom?: string;
    duree_minutes: number;
}

export default function SeancesPage() {
    // États pour les données de formulaire
    const [seances, setSeances] = useState<Seance[]>([])
    const [cours, setCours] = useState<Cour[]>([])
    const [types, setTypes] = useState<TypeSeance[]>([])
    const [groupes, setGroupes] = useState<Groupe[]>([])
    const [enseignants, setEnseignants] = useState<Enseignant[]>([])
    const [selectedNiveau, setSelectedNiveau] = useState<string>('')

    // États pour le formulaire et l'UI
    const [newSeance, setNewSeance] = useState<SeanceForm>({
        cours_id: '', type_id: '', groupe_id: '', enseignant_id: '', duree_minutes: '90'
    })
    const [editingSeance, setEditingSeance] = useState<Seance | null>(null)
    const [editingSeanceForm, setEditingSeanceForm] = useState<SeanceForm | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)
    const [editingSelectedNiveau, setEditingSelectedNiveau] = useState<string>('')

    // Chargement initial des données
    useEffect(() => {
        fetchInitialData()
    }, [])

    const fetchInitialData = async () => {
        setLoading(true)
        await Promise.all([
            fetchSeances(),
            fetchCours(),
            fetchTypesSeances(),
            fetchGroupes(),
            fetchEnseignants(),
        ])
        setLoading(false)
    }

    // Fonctions de fetch
    const fetchSeances = async () => {
        const { data, error } = await supabase
            .from('seances')
            .select(`
                id,
                duree_minutes,
                cours:cours_id (id, nom),
                types_seances:type_id (id, nom),
                groupes:groupe_id (id, nom),
                enseignants:enseignant_id (id, nom)
            `)
        if (error) setError('Impossible de charger les séances.')
        else setSeances(data as any)
    }
    const fetchCours = async () => {
        const { data, error } = await supabase.from('cours').select('id, nom').order('nom')
        if (!error) setCours(data)
    }
    const fetchTypesSeances = async () => {
        const { data, error } = await supabase.from('types_seances').select('id, nom').order('nom')
        console.log('types_seances:', data, error);
        if (!error) setTypes(data)
    }
    const fetchGroupes = async () => {
        const { data, error } = await supabase.from('groupes').select('id, nom, niveau').order('nom')
        if (!error) setGroupes(data)
    }
    const fetchEnseignants = async () => {
        const { data, error } = await supabase.from('enseignants').select('id, nom').order('nom')
        if (!error) setEnseignants(data)
    }

    const handleImportExcel = async (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setLoading(true);
        setError(null);
        setSuccess(null);
        try {
            const coursMap = new Map(cours.map(c => [c.nom.toLowerCase(), c.id]));
            const typesMap = new Map(types.map(t => [t.nom.toLowerCase(), t.id]));
            const groupesMap = new Map(groupes.map(g => [g.nom.toLowerCase(), g.id]));
            const enseignantsMap = new Map(enseignants.map(en => [en.nom.toLowerCase(), en.id]));
            const reader = new FileReader();
            reader.onload = async (event) => {
                try {
                    const data = event.target?.result;
                    const workbook = XLSX.read(data, { type: 'binary' });
                    const sheetName = workbook.SheetNames[0];
                    const sheet = workbook.Sheets[sheetName];
                    const jsonData = XLSX.utils.sheet_to_json<ExcelRow>(sheet);
                    const seancesToInsert = jsonData.map(row => {
                        const cours_id = coursMap.get(row.cours_nom?.trim().toLowerCase());
                        const type_id = typesMap.get(row.type_nom?.trim().toLowerCase());
                        const groupe_id = groupesMap.get(row.groupe_nom?.trim().toLowerCase());
                        const enseignant_id = row.enseignant_nom ? enseignantsMap.get(row.enseignant_nom.trim().toLowerCase()) : null;
                        if (!cours_id || !type_id || !groupe_id) {
                            throw new Error(`Données invalides pour la ligne avec le cours "${row.cours_nom}". Vérifiez que le cours, le type et le groupe existent.`);
                        }
                        if (row.enseignant_nom && enseignant_id === undefined) {
                            throw new Error(`L'enseignant "${row.enseignant_nom}" n'a pas été trouvé.`);
                        }
                        return {
                            cours_id,
                            type_id,
                            groupe_id,
                            enseignant_id: enseignant_id,
                            duree_minutes: Number(row.duree_minutes) || 90,
                        };
                    });
                    if (seancesToInsert.length > 0) {
                        const { error: insertError } = await supabase.from('seances').insert(seancesToInsert);
                        if (insertError) {
                            throw insertError;
                        }
                        setSuccess(`${seancesToInsert.length} séance(s) importée(s) avec succès.`);
                        fetchInitialData();
                    } else {
                        setError("Le fichier Excel ne contenait aucune ligne valide.");
                    }
                } catch (err: any) {
                    setError(`Erreur lors du traitement du fichier : ${err.message}`);
                } finally {
                    setLoading(false);
                    e.target.value = '';
                }
            };
            reader.readAsBinaryString(file);
        } catch (err: any) {
            setError(`Erreur d'importation : ${err.message}`);
            setLoading(false);
        }
    };

    // Fonctions CRUD
    const handleAddSeance = async (e: FormEvent) => {
        e.preventDefault()
        const { cours_id, type_id, groupe_id } = newSeance
        if (!cours_id || !type_id || !groupe_id) {
            setError('Cours, Type et Groupe sont obligatoires.')
            return
        }
        setError(null)
        setSuccess(null)
        const { data, error } = await supabase
            .from('seances')
            .insert([{ ...newSeance, enseignant_id: newSeance.enseignant_id || null, duree_minutes: Number(newSeance.duree_minutes) }])
            .select('*, cours(nom), types_seances(nom), groupes(nom), enseignants(nom)')
        if (error) {
            setError(`Erreur lors de l'ajout: ${error.message}`)
        } else if (data) {
            setSeances([...seances, ...(data as Seance[])])
            setNewSeance({ duree_minutes: '90', cours_id: '', type_id: '', groupe_id: '', enseignant_id: '' })
            setSuccess('Séance ajoutée avec succès.')
        }
    }

    const handleDeleteSeance = async (id: string) => {
        if (!confirm('Êtes-vous sûr de vouloir supprimer cette séance ?')) return
        const { error } = await supabase.from('seances').delete().eq('id', id)
        if (error) {
            setError(`Impossible de supprimer: ${error.message}`)
            setSuccess(null)
        } else {
            setSeances(seances.filter((s) => s.id !== id))
            setSuccess('Séance supprimée.')
            setError(null)
        }
    }
    
    const startEditing = (seance: Seance) => {
        setEditingSeance(seance)
        const groupe = groupes.find(g => g.id === seance.groupe_id);
        setEditingSelectedNiveau(groupe?.niveau || '');
        setEditingSeanceForm({
            cours_id: seance.cours_id,
            type_id: seance.type_id,
            groupe_id: seance.groupe_id,
            enseignant_id: seance.enseignant_id || '',
            duree_minutes: String(seance.duree_minutes)
        })
    }

    const handleUpdateSeance = async (e: FormEvent) => {
        e.preventDefault()
        if (!editingSeance || !editingSeanceForm) return

        const { data, error } = await supabase
            .from('seances')
            .update({
                cours_id: editingSeanceForm.cours_id,
                type_id: editingSeanceForm.type_id,
                groupe_id: editingSeanceForm.groupe_id,
                enseignant_id: editingSeanceForm.enseignant_id || null,
                duree_minutes: parseInt(editingSeanceForm.duree_minutes),
            })
            .eq('id', editingSeance.id)
            .select('*, cours(nom), types_seances(nom), groupes(nom), enseignants(nom)')

        if (error) {
            setError(`Erreur: ${error.message}`)
        } else {
            setEditingSeance(null)
            setEditingSeanceForm(null)
            setSeances(seances.map(s => s.id === editingSeance.id ? (data[0] as Seance) : s))
            setSuccess('Séance mise à jour.')
        }
    }
    
    const renderEditForm = () => (
        editingSeance && editingSeanceForm && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
                <div className="bg-white p-8 rounded-lg shadow-2xl w-full max-w-lg">
                    <h2 className="text-2xl font-bold mb-6">Modifier la Séance</h2>
                    <form onSubmit={handleUpdateSeance} className="space-y-4">
                        {/* Les mêmes champs que le formulaire d'ajout, pré-remplis */}
                         <select required value={editingSeanceForm.cours_id} onChange={e => setEditingSeanceForm({...editingSeanceForm, cours_id: e.target.value})} className="w-full p-2 border rounded">
                            <option value="">Sélectionner un cours</option>
                            {cours.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
                        </select>
                        <select required value={editingSeanceForm.type_id} onChange={e => setEditingSeanceForm({...editingSeanceForm, type_id: e.target.value})} className="w-full p-2 border rounded">
                            <option value="">Sélectionner un type</option>
                            {types.map(t => <option key={t.id} value={t.id}>{t.nom}</option>)}
                        </select>
                         <select value={editingSelectedNiveau} onChange={e => { setEditingSelectedNiveau(e.target.value); setEditingSeanceForm(editingSeanceForm ? { ...editingSeanceForm, groupe_id: '' } : null) }} className="w-full p-2 border rounded">
                            <option value="">Sélectionner un niveau</option>
                            {[...new Set(groupes.map(g => g.niveau).filter(Boolean))].map(niv => (
                                <option key={niv as string} value={niv as string}>{niv}</option>
                            ))}
                        </select>
                        <select required value={editingSeanceForm.groupe_id} onChange={e => setEditingSeanceForm(editingSeanceForm ? { ...editingSeanceForm, groupe_id: e.target.value } : null)} className="w-full p-2 border rounded" disabled={!editingSelectedNiveau}>
                            <option value="">Sélectionner un groupe</option>
                            {groupes.filter(g => g.niveau === editingSelectedNiveau).map(g => <option key={g.id} value={g.id}>{g.nom}</option>)}
                        </select>
                         <select value={editingSeanceForm.enseignant_id} onChange={e => setEditingSeanceForm({...editingSeanceForm, enseignant_id: e.target.value})} className="w-full p-2 border rounded">
                            <option value="">Sélectionner un enseignant</option>
                            {enseignants.map(en => <option key={en.id} value={en.id}>{en.nom}</option>)}
                        </select>
                        <input type="number" required value={editingSeanceForm.duree_minutes} onChange={e => setEditingSeanceForm({...editingSeanceForm, duree_minutes: e.target.value})} className="w-full p-2 border rounded" placeholder="Durée en minutes"/>
                        
                        <div className="flex justify-end space-x-4">
                            <button type="button" onClick={() => setEditingSeance(null)} className="px-4 py-2 bg-gray-200 rounded">Annuler</button>
                            <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded">Mettre à jour</button>
                        </div>
                    </form>
                </div>
            </div>
        )
    )

    return (
        <div className="container mx-auto px-4 sm:px-8 py-8">
            <div className="flex justify-between items-center mb-8">
                <div className="flex items-center">
                    <FaClipboardList className="text-3xl text-teal-500 mr-4" />
                    <h1 className="text-4xl font-bold text-gray-800">Gestion des Séances</h1>
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

            {error && <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-6"><p>{error}</p></div>}
            {success && <div className="bg-green-100 border-l-4 border-green-500 text-green-700 p-4 mb-6"><p>{success}</p></div>}
            
            {/* Formulaire d'ajout */}
            <div className="bg-white p-6 rounded-lg shadow-md mb-8">
                <h2 className="text-2xl font-semibold text-gray-700 mb-4">Ajouter une séance</h2>
                <form onSubmit={handleAddSeance} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {/* Sélection du niveau */}
                    <select value={selectedNiveau} onChange={e => { setSelectedNiveau(e.target.value); setNewSeance({ ...newSeance, groupe_id: '' }) }} className="w-full p-2 border rounded bg-gray-50">
                        <option value="">Sélectionner un niveau</option>
                        {[...new Set(groupes.map(g => g.niveau).filter(Boolean))].map(niv => (
                            <option key={niv as string} value={niv as string}>{niv}</option>
                        ))}
                    </select>
                    {/* Liste des groupes filtrée par niveau */}
                    <select required value={newSeance.groupe_id} onChange={e => setNewSeance({...newSeance, groupe_id: e.target.value})} className="w-full p-2 border rounded bg-gray-50" disabled={!selectedNiveau}>
                        <option value="">Sélectionner un groupe</option>
                        {groupes.filter(g => g.niveau === selectedNiveau).map(g => <option key={g.id} value={g.id}>{g.nom}</option>)}
                    </select>
                    {/* Les autres champs (cours, type, enseignant, durée) */}
                    <select required value={newSeance.cours_id} onChange={e => setNewSeance({...newSeance, cours_id: e.target.value})} className="w-full p-2 border rounded bg-gray-50">
                        <option value="">Sélectionner un cours</option>
                        {cours.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
                    </select>
                    <select required value={newSeance.type_id} onChange={e => setNewSeance({...newSeance, type_id: e.target.value})} className="w-full p-2 border rounded bg-gray-50">
                        <option value="">Sélectionner un type</option>
                        {types.map(t => <option key={t.id} value={t.id}>{t.nom}</option>)}
                    </select>
                    <select value={newSeance.enseignant_id} onChange={e => setNewSeance({...newSeance, enseignant_id: e.target.value})} className="w-full p-2 border rounded bg-gray-50">
                        <option value="">Sélectionner un enseignant</option>
                        {enseignants.map(e => <option key={e.id} value={e.id}>{e.nom}</option>)}
                    </select>
                    <input type="number" required value={newSeance.duree_minutes} onChange={e => setNewSeance({...newSeance, duree_minutes: e.target.value})} className="w-full p-2 border rounded bg-gray-50" placeholder="Durée (min)"/>
                    <button type="submit" className="bg-teal-600 text-white p-2 rounded hover:bg-teal-700 flex items-center justify-center">
                        <FaPlus className="mr-2"/> Ajouter Séance
                    </button>
                </form>
            </div>

            {/* Liste des séances */}
            <div className="bg-white shadow-md rounded-lg overflow-hidden">
                {loading ? <p className="p-4 text-center">Chargement...</p> : (
                    <table className="min-w-full leading-normal">
                        <thead>
                            <tr>
                                <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Cours</th>
                                <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Type</th>
                                <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Groupe</th>
                                <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Enseignant</th>
                                <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Durée</th>
                                <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {seances.map(s => (
                                <tr key={s.id} className="hover:bg-gray-50">
                                    <td className="px-5 py-4 border-b border-gray-200 text-sm">{s.cours?.nom ?? <span className="text-gray-400">N/A</span>}</td>
                                    <td className="px-5 py-4 border-b border-gray-200 text-sm">{s.types_seances?.nom ?? <span className="text-gray-400">N/A</span>}</td>
                                    <td className="px-5 py-4 border-b border-gray-200 text-sm">{s.groupes?.nom ?? <span className="text-gray-400">N/A</span>}</td>
                                    <td className="px-5 py-4 border-b border-gray-200 text-sm">{s.enseignants?.nom || <span className="text-gray-400">N/A</span>}</td>
                                    <td className="px-5 py-4 border-b border-gray-200 text-sm">{s.duree_minutes} min</td>
                                    <td className="px-5 py-4 border-b border-gray-200 text-sm text-center">
                                        <div className="flex justify-center items-center space-x-3">
                                            <button onClick={() => startEditing(s)} className="text-yellow-600 hover:text-yellow-800"><FaPencilAlt /></button>
                                            <button onClick={() => handleDeleteSeance(s.id)} className="text-red-600 hover:text-red-800"><FaTrash /></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {renderEditForm()}
        </div>
    )
}
