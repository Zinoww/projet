'use client'

import { useState, useEffect, FormEvent, ChangeEvent, useCallback } from 'react'
import { supabase } from '@/src/lib/supabaseClient'
import { FaClipboardList, FaPlus, FaTrash, FaPencilAlt, FaArrowLeft, FaFileExcel } from 'react-icons/fa'
import Link from 'next/link'
import * as XLSX from 'xlsx'

// Ajout du type Section
interface Section { id: string; nom: string; niveau: string | null; filiere_id?: string | null; }
// Interfaces pour les données externes
interface Cour { id: string; nom: string; niveau: string | null; }
interface TypeSeance { id: string; nom: string; }
interface Groupe { id: string; nom: string; niveau: string | null; }
interface Enseignant { id: string; nom: string; }

// Interface pour une séance (avec les données jointes pour l'affichage)
interface Seance {
    id: string
    duree_minutes: number | null
    cours_id: string
    type_id: string
    groupe_id: string | null
    section_id?: string | null
    enseignant_id: string | null
    cours: { nom: string } | null
    filiere_id: string | null
    niveau?: string | null
    types_seances: { nom: string } | null
    groupes: { nom: string } | null
    enseignants: { nom: string } | null
    sections?: { nom: string } | null
    filieres?: { nom: string } | null
}
interface Filiere { id: string; nom: string; }

// Interface pour la création/modification de séance
interface SeanceForm {
    cours_id: string
    type_id: string
    groupe_id: string
    section_id?: string
    filiere_id?: string
    enseignant_id: string
    duree_minutes: string
    niveau?: string
}

interface ExcelRow {
    cours_nom: string;
    type_nom: string;
    groupe_nom: string;
    enseignant_nom?: string;
    duree_minutes: number;
}

const NIVEAUX = ['L1', 'L2', 'L3', 'M1', 'M2'];


export default function SeancesPage() {
    // États pour les données de formulaire
    const [seances, setSeances] = useState<Seance[]>([])
    const [cours, setCours] = useState<Cour[]>([])
    const [types, setTypes] = useState<TypeSeance[]>([])
    const [enseignants, setEnseignants] = useState<Enseignant[]>([])
    const [groupes, setGroupes] = useState<Groupe[]>([])
    const [sections, setSections] = useState<Section[]>([])
    const [filieres, setFilieres] = useState<Filiere[]>([])
    const [selectedNiveau, setSelectedNiveau] = useState<string>('')

    // États pour le formulaire et l'UI
    const [newSeance, setNewSeance] = useState<SeanceForm>({
        cours_id: '',
        type_id: '',
        groupe_id: '',
        section_id: '',
        filiere_id: '',
        enseignant_id: '',
        duree_minutes: '90',
        niveau: ''
    })
    const [editingSeance, setEditingSeance] = useState<Seance | null>(null)
    const [editingSeanceForm, setEditingSeanceForm] = useState<SeanceForm | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)
    const [editingSelectedNiveau, setEditingSelectedNiveau] = useState<string>('')


    // Chargement initial des données (hors sections)
    const fetchInitialData = useCallback(async () => {
        setLoading(true)
        try {
            const [seancesResult, coursResult, typesResult, enseignantsResult, groupesResult, filieresResult] = await Promise.all([
                supabase.from('seances').select('*, cours(*), types_seances(*), enseignants(*), groupes(*), sections(*), filieres(*)').order('id', { ascending: false }),
                supabase.from('cours').select('*').order('nom', { ascending: true }),
                supabase.from('types_seances').select('*').order('nom', { ascending: true }),
                supabase.from('enseignants').select('*').order('nom', { ascending: true }),
                supabase.from('groupes').select('*').order('nom', { ascending: true }),
                supabase.from('filieres').select('*').order('nom', { ascending: true })
            ])

            if (seancesResult.error) throw seancesResult.error
            if (coursResult.error) throw coursResult.error
            if (typesResult.error) throw typesResult.error
            if (enseignantsResult.error) throw enseignantsResult.error
            if (groupesResult.error) throw groupesResult.error

            setSeances(seancesResult.data || [])
            setCours(coursResult.data || [])
            setTypes(typesResult.data || [])
            setEnseignants(enseignantsResult.data || [])
            setGroupes(groupesResult.data || [])
            setFilieres(filieresResult.data || [])
        } catch {
            setError('Impossible de charger les données.')
        } finally {
            setLoading(false)
        }
    }, [])

    // Charger dynamiquement les sections selon la filière sélectionnée (création)
    useEffect(() => {
        const fetchSections = async () => {
            if (!newSeance.filiere_id) {
                setSections([]);
                return;
            }
            const { data, error } = await supabase
                .from('sections')
                .select('*')
                .eq('filiere_id', newSeance.filiere_id)
                .order('nom', { ascending: true });
            console.log('[DEBUG] fetchSections (création) - filiere_id:', newSeance.filiere_id, 'data:', data, 'error:', error);
            if (!error) {
                setSections(data || []);
            } else {
                setSections([]);
            }
        };
        fetchSections();
    }, [newSeance.filiere_id]);

    // Charger dynamiquement les sections selon la filière sélectionnée (édition)
    const [editingSections, setEditingSections] = useState<Section[]>([]);
    useEffect(() => {
        const fetchEditingSections = async () => {
            if (!editingSeanceForm?.filiere_id) {
                setEditingSections([]);
                return;
            }
            const { data, error } = await supabase
                .from('sections')
                .select('*')
                .eq('filiere_id', editingSeanceForm.filiere_id)
                .order('nom', { ascending: true });
            console.log('[DEBUG] lynda fetchEditingSections - result:', { data, error });
            if (!error) {
                setEditingSections(data || []);
            } else {
                setEditingSections([]);
            }
        };
        if (editingSeanceForm?.filiere_id) {
            fetchEditingSections();
        } else {
            setEditingSections([]);
        }
    }, [editingSeanceForm?.filiere_id]);

    // Chargement initial des données
    useEffect(() => {
        fetchInitialData()
    }, [fetchInitialData])

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
            const filieresMap = new Map(filieres.map(f => [f.nom.toLowerCase(), f.id]));

            let allSections = sections;
            if (!sections || sections.length < 1) {
                const { data: allSectionsData, error: allSectionsError } = await supabase.from('sections').select('*');
                if (!allSectionsError && allSectionsData) {
                    allSections = allSectionsData;
                }
            }
            const sectionsMap = new Map((allSections || []).map(s => [s.nom.toLowerCase(), s.id]));

            console.log('Cours disponibles:', Array.from(coursMap.keys()));
            console.log('Types disponibles:', Array.from(typesMap.keys()));
            console.log('Groupes disponibles:', Array.from(groupesMap.keys()));
            console.log('Enseignants disponibles:', Array.from(enseignantsMap.keys()));
            console.log('Filieres disponibles:', Array.from(filieresMap.keys()));
            console.log('Sections disponibles:', Array.from(sectionsMap.keys()));

            const reader = new FileReader();
            reader.onload = async (event) => {
                try {
                    const data = event.target?.result;
                    const workbook = XLSX.read(data, { type: 'binary' });
                    const sheetName = workbook.SheetNames[0];
                    const sheet = workbook.Sheets[sheetName];
                    // Ajout des nouveaux champs dans ExcelRow
                    type ExcelRowExtended = ExcelRow & { niveau?: string; section_nom?: string; filiere_nom?: string };
                    const jsonData = XLSX.utils.sheet_to_json<ExcelRowExtended>(sheet);

                    console.log('Données Excel:', jsonData);

                    const seancesToInsert = jsonData
                        .map(row => {
                            const coursNom = row.cours_nom?.trim().toLowerCase();
                            const typeNom = row.type_nom?.trim().toLowerCase();
                            const groupeNom = row.groupe_nom?.trim().toLowerCase();
                            const filiereNom = row.filiere_nom?.trim().toLowerCase();
                            const sectionNom = row.section_nom?.trim().toLowerCase();
                            const niveau = row.niveau?.trim();

                            const cours_id = coursNom ? coursMap.get(coursNom) : null;
                            const type_id = typeNom ? typesMap.get(typeNom) : null;
                            const groupe_id = groupeNom ? groupesMap.get(groupeNom) : null;
                            const enseignant_id = row.enseignant_nom ? enseignantsMap.get(row.enseignant_nom.trim().toLowerCase()) : null;
                            const filiere_id = filiereNom ? filieresMap.get(filiereNom) : null;
                            const section_id = sectionNom ? sectionsMap.get(sectionNom) : null;

                            // cours_nom, type_nom et duree_minutes sont obligatoires pour insérer la ligne
                            if (!cours_id || !type_id || !row.duree_minutes) {
                                console.warn(`Ligne ignorée (cours, type ou durée manquant ou non trouvé):`, row);
                                return null;
                            }

                            return {
                                cours_id,
                                type_id,
                                groupe_id: groupe_id || null,
                                enseignant_id: enseignant_id || null,
                                duree_minutes: Number(row.duree_minutes) || 90,
                                filiere_id: filiere_id || null,
                                section_id: section_id || null,
                                niveau: niveau || null,
                            };
                        })
                        .filter(Boolean); // enlève les lignes null
                    if (seancesToInsert.length > 0) {
                        const { error: insertError } = await supabase.from('seances').insert(seancesToInsert);
                        if (insertError) {
                            throw insertError;
                        }
                        setSuccess(`${seancesToInsert.length} séance(s) importée(s) avec succès.`);
                        fetchInitialData();
                    } else {
                        setError("Le fichier Excel ne contenait aucune ligne valide ou les champs obligatoires étaient manquants.");
                    }
                } catch (err: unknown) {
                    const errorMessage = err instanceof Error ? err.message : 'Erreur inconnue';
                    setError(`Erreur lors du traitement du fichier : ${errorMessage}`);
                } finally {
                    setLoading(false);
                    e.target.value = '';
                }
            };
            reader.readAsBinaryString(file);
        } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : 'Erreur inconnue';
            setError(`Erreur d'importation : ${errorMessage}`);
            setLoading(false);
        }
    };

    // Fonctions CRUD
    const handleAddSeance = async (e: FormEvent) => {
        e.preventDefault();
        const { cours_id, type_id, groupe_id, section_id } = newSeance;
        if (!cours_id) {
            setError('Le cours est obligatoire.');
            return;
        }
        // Trouver le type sélectionné
        const typeObj = types.find(t => t.id === type_id);
        const isCM = typeObj?.nom?.toLowerCase().includes('cm');
        if (isCM && !section_id) {
            setError('La section est obligatoire pour un CM.');
            return;
        }
        if (!isCM && !groupe_id) {
            setError('Le groupe est obligatoire pour ce type de séance.');
            return;
        }
        setError(null);
        setSuccess(null);
        const insertObj = {
            cours_id,
            type_id,
            enseignant_id: newSeance.enseignant_id || null,
            section_id,
            groupe_id: newSeance.groupe_id || null,
            duree_minutes: Number(newSeance.duree_minutes),
            filiere_id: newSeance.filiere_id || null,
            niveau: selectedNiveau || null
        };
        if (isCM) {
            insertObj.section_id = section_id;
            insertObj.groupe_id = null;
        } else {
            insertObj.groupe_id = groupe_id;
            insertObj.section_id = section_id;
        }
        const { data, error } = await supabase
            .from('seances')
            .insert([insertObj])
            .select('*, cours(nom), types_seances(nom), groupes(nom), enseignants(nom), sections(*), filieres(*)');
        if (error) {
            const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
            setError(`Erreur lors de l'ajout: ${errorMessage}`);
        } else if (data) {
            setSeances([...seances, ...(data as Seance[])]);
            setNewSeance({ duree_minutes: '90', cours_id: '', groupe_id: '', section_id: '', enseignant_id: '', type_id: '', filiere_id: '', niveau: '' });
            setSuccess('Séance ajoutée avec succès.');
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
        const form = {
            cours_id: seance.cours_id,
            type_id: seance.type_id,
            groupe_id: seance.groupe_id || '',
            enseignant_id: seance.enseignant_id || '',
            duree_minutes: seance.duree_minutes?.toString() || '90',
            filiere_id: seance.filiere_id || ''
        };
        console.log('[DEBUG] startEditing - form:', form);
        setEditingSeance(seance)
        setEditingSeanceForm(form)
        // Initialiser le niveau basé sur le cours
        const coursActuel = cours.find(c => c.id === seance.cours_id)
        setEditingSelectedNiveau(coursActuel?.niveau || '')
    }

    const handleUpdateSeance = async (e: FormEvent) => {
        e.preventDefault()
        if (!editingSeance || !editingSeanceForm) return

        // Créer un objet avec seulement les champs qui ont changé
        const updates: Partial<{
            cours_id: string;
            type_id: string;
            groupe_id: string;
            enseignant_id: string | null;
            filiere_id: string | null;
            section_id: string | null;
            duree_minutes: number;
        }> = {}

        // Comparer chaque champ et ajouter seulement ceux qui ont changé
        if (editingSeanceForm.cours_id && editingSeanceForm.cours_id !== editingSeance.cours_id) {
            updates.cours_id = editingSeanceForm.cours_id
        }

        if (editingSeanceForm.type_id && editingSeanceForm.type_id !== editingSeance.type_id) {
            updates.type_id = editingSeanceForm.type_id
        }

        if (editingSeanceForm.groupe_id && editingSeanceForm.groupe_id !== editingSeance.groupe_id) {
            updates.groupe_id = editingSeanceForm.groupe_id
        }

        if (editingSeanceForm.section_id && editingSeanceForm.section_id !== editingSeance.section_id) {
            updates.section_id = editingSeanceForm.section_id
        }

        if (editingSeanceForm.filiere_id && editingSeanceForm.filiere_id !== editingSeance.filiere_id) {
            updates.filiere_id = editingSeanceForm.filiere_id
        }

        // Gestion spéciale pour l'enseignant (peut être null ou vide)
        const currentEnseignantId = editingSeance.enseignant_id || ''
        const newEnseignantId = editingSeanceForm.enseignant_id || ''
        if (newEnseignantId !== currentEnseignantId) {
            updates.enseignant_id = newEnseignantId || null
        }

        // Comparer la durée seulement si elle a été modifiée
        const currentDuree = editingSeance.duree_minutes || 90
        const newDuree = parseInt(editingSeanceForm.duree_minutes) || 90
        if (newDuree !== currentDuree) {
            updates.duree_minutes = newDuree
        }

        // Si aucun changement détecté
        if (Object.keys(updates).length === 0) {
            setEditingSeance(null)
            setEditingSeanceForm(null)
            setSuccess('Aucune modification détectée.')
            return
        }

        console.log('Modifications détectées:', updates)

        const { data, error } = await supabase
            .from('seances')
            .update(updates)
            .eq('id', editingSeance.id)
            .select('*, cours(nom), types_seances(nom), groupes(nom), enseignants(nom), sections(*), filieres(*)')

        if (error) {
            const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
            setError(`Erreur lors de la mise à jour: ${errorMessage}`);
        } else {
            setEditingSeance(null)
            setEditingSeanceForm(null)
            setSeances(seances.map(s => s.id === editingSeance.id ? (data[0] as Seance) : s))
            setSuccess(`Séance mise à jour avec succès. ${Object.keys(updates).length} champ(s) modifié(s).`)
        }
    }

    const renderEditForm = () => (
        editingSeance && editingSeanceForm && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
                <div className="bg-white p-8 rounded-lg shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                    <h2 className="text-2xl font-bold mb-6">Modifier la Séance</h2>

                    {/* Affichage des informations actuelles */}
                    <div className="bg-gray-50 p-4 rounded-lg mb-6">
                        <h3 className="text-sm font-semibold text-gray-700 mb-3">Informations actuelles :</h3>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                            <div><span className="font-medium">Cours :</span> {editingSeance.cours?.nom}</div>
                            <div><span className="font-medium">Type :</span> {editingSeance.types_seances?.nom}</div>
                            <div><span className="font-medium">Groupe :</span> {editingSeance.groupes?.nom}</div>
                            <div><span className="font-medium">Section :</span> {editingSeance.sections?.nom ?? <span className="text-gray-400">N/A</span>}</div>
                            <div><span className="font-medium">Filière :</span> {editingSeance.filieres?.nom ?? <span className="text-gray-400">N/A</span>}</div>
                            <div><span className="font-medium">Enseignant :</span> {editingSeance.enseignants?.nom || 'Non assigné'}</div>
                            <div><span className="font-medium">Durée :</span> {editingSeance.duree_minutes} min</div>
                        </div>
                    </div>

                    <form onSubmit={handleUpdateSeance} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Niveau</label>
                            <select value={editingSelectedNiveau} onChange={e => { setEditingSelectedNiveau(e.target.value); setEditingSeanceForm(editingSeanceForm ? { ...editingSeanceForm, cours_id: '', groupe_id: '' } : null) }} className="w-full p-2 border rounded">
                                <option value="">Sélectionner un niveau</option>
                                {editingSelectedNiveau && (
                                    <option value={editingSelectedNiveau} className="font-semibold bg-gray-100">
                                        {editingSelectedNiveau} (actuel)
                                    </option>
                                )}
                                {NIVEAUX.filter(niv => niv !== editingSelectedNiveau).map(niv => (
                                    <option key={niv} value={niv}>
                                        {niv}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Filière</label>
                            <select
                                required
                                value={editingSeanceForm.filiere_id || ''}
                                onChange={e => setEditingSeanceForm({ ...editingSeanceForm, filiere_id: e.target.value })}
                                className="w-full p-2 border rounded bg-gray-50"
                            >
                                <option value="">Sélectionner une filière</option>
                                {filieres.map(f => <option key={f.id} value={f.id}>{f.nom}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Section</label>
                            <select
                                required
                                value={editingSeanceForm.section_id || ''}
                                onChange={e => setEditingSeanceForm({ ...editingSeanceForm, section_id: e.target.value })}
                                className="w-full p-2 border rounded bg-gray-50"
                                disabled={!editingSeanceForm.filiere_id}
                            >
                                <option value="">Sélectionner une section</option>
                                {editingSections.map(s => <option key={s.id} value={s.id}>{s.nom}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Cours</label>
                            <select value={editingSeanceForm.cours_id} onChange={e => setEditingSeanceForm(editingSeanceForm ? { ...editingSeanceForm, cours_id: e.target.value } : null)} className="w-full p-2 border rounded" disabled={!editingSelectedNiveau}>
                                <option value="">Sélectionner un cours</option>
                                {editingSeance.cours && (
                                    <option value={editingSeance.cours_id} className="font-semibold bg-gray-100">
                                        {editingSeance.cours.nom} (actuel)
                                    </option>
                                )}
                                {cours.filter(c => c.niveau === editingSelectedNiveau && c.id !== editingSeance.cours_id).map(c => (
                                    <option key={c.id} value={c.id}>
                                        {c.nom}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                            <select value={editingSeanceForm.type_id} onChange={e => setEditingSeanceForm(editingSeanceForm ? { ...editingSeanceForm, type_id: e.target.value } : null)} className="w-full p-2 border rounded">
                                <option value="">Sélectionner un type</option>
                                {editingSeance.types_seances && (
                                    <option value={editingSeance.type_id} className="font-semibold bg-gray-100">
                                        {editingSeance.types_seances.nom} (actuel)
                                    </option>
                                )}
                                {types.filter(t => t.id !== editingSeance.type_id).map(t => (
                                    <option key={t.id} value={t.id}>
                                        {t.nom}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Groupe</label>
                            <select value={editingSeanceForm.groupe_id} onChange={e => setEditingSeanceForm(editingSeanceForm ? { ...editingSeanceForm, groupe_id: e.target.value } : null)} className="w-full p-2 border rounded">
                                <option value="">Sélectionner un groupe</option>
                                {editingSeance.groupes && (
                                    <option value={editingSeance.groupe_id ?? ''} className="font-semibold bg-gray-100">
                                        {editingSeance.groupes.nom} (actuel)
                                    </option>
                                )}
                                {groupes.filter(g => g.id !== editingSeance.groupe_id).map(g => (
                                    <option key={g.id} value={g.id}>
                                        {g.nom}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Enseignant</label>
                            <select value={editingSeanceForm.enseignant_id} onChange={e => setEditingSeanceForm({ ...editingSeanceForm, enseignant_id: e.target.value })} className="w-full p-2 border rounded">
                                <option value="">Sélectionner un enseignant</option>
                                {editingSeance.enseignants ? (
                                    <option value={editingSeance.enseignant_id || ''} className="font-semibold bg-gray-100">
                                        {editingSeance.enseignants.nom} (actuel)
                                    </option>
                                ) : (
                                    <option value="" className="font-semibold bg-gray-100">
                                        Non assigné (actuel)
                                    </option>
                                )}
                                {enseignants.filter(en => en.id !== editingSeance.enseignant_id).map(en => (
                                    <option key={en.id} value={en.id}>
                                        {en.nom}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Durée (minutes)</label>
                            <input type="number" value={editingSeanceForm.duree_minutes} onChange={e => setEditingSeanceForm({ ...editingSeanceForm, duree_minutes: e.target.value })} className="w-full p-2 border rounded" placeholder="Durée en minutes" />
                        </div>
                        <div className="flex justify-end space-x-4 pt-4">
                            <button type="button" onClick={() => { setEditingSeance(null); setEditingSeanceForm(null) }} className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300">Annuler</button>
                            <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700">Mettre à jour</button>
                        </div>
                    </form>
                </div>
            </div>
        )
    )

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 to-indigo-100 p-4 sm:p-6 lg:p-8">
            <div className="max-w-7xl mx-auto">
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
                            <FaArrowLeft className="mr-2" />
                            Retour &agrave; l&#39;accueil
                        </Link>
                    </div>
                </div>

                {error && <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-6 rounded-lg"><p>{error}</p></div>}
                {success && <div className="bg-green-100 border-l-4 border-green-500 text-green-700 p-4 mb-6 rounded-lg"><p>{success}</p></div>}

                {/* Formulaire d'ajout */}
                <div className="bg-white p-6 rounded-2xl shadow-xl mb-8 border border-indigo-100">
                    <h2 className="text-2xl font-semibold text-gray-700 mb-4">Ajouter une séance</h2>
                    <form onSubmit={handleAddSeance} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {/* Sélection du niveau */}
                        <select value={selectedNiveau} onChange={e => { setSelectedNiveau(e.target.value); setNewSeance({ ...newSeance, niveau: e.target.value, cours_id: '', groupe_id: '', type_id: '', section_id: '' }) }} className="w-full p-2 border rounded bg-gray-50">
                            <option value="">Sélectionner un niveau</option>
                            {NIVEAUX.map(niv => (
                                <option key={niv} value={niv}>{niv}</option>
                            ))}
                        </select>
                        {/* Sélection de la filière */}
                        <select
                            required
                            value={newSeance.filiere_id || ''}
                            onChange={e => setNewSeance({ ...newSeance, filiere_id: e.target.value })}
                            className="w-full p-2 border rounded bg-gray-50"
                        >
                            <option value="">Sélectionner une filière</option>
                            {filieres.map(f => <option key={f.id} value={f.id}>{f.nom}</option>)}
                        </select>
                        {/* Liste des cours filtrée par niveau */}
                        <select required value={newSeance.cours_id} onChange={e => setNewSeance({ ...newSeance, cours_id: e.target.value })} className="w-full p-2 border rounded bg-gray-50" disabled={!selectedNiveau}>
                            <option value="">Sélectionner un cours</option>
                            {cours.filter(c => c.niveau === selectedNiveau).map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
                        </select>
                        {/* Sélection du type */}
                        <select
                            required
                            value={newSeance.type_id}
                            onChange={e => setNewSeance({ ...newSeance, type_id: e.target.value })}
                            className="w-full p-2 border rounded bg-gray-50"
                        >
                            <option value="">Sélectionner un type</option>
                            {types.map(t => <option key={t.id} value={t.id}>{t.nom}</option>)}
                        </select>
                        {/* Sélection de la section (toujours affichée) */}
                        <select
                            required
                            value={newSeance.section_id || ''}
                            onChange={e => setNewSeance({ ...newSeance, section_id: e.target.value })}
                            className="w-full p-2 border rounded bg-gray-50"
                            disabled={!newSeance.filiere_id}
                        >
                            <option value="">Sélectionner une section</option>
                            {sections.map(s => <option key={s.id} value={s.id}>{s.nom}</option>)}
                        </select>
                        {/* Sélection du groupe (désactivé ou masqué si CM) */}
                        {types.find(t => t.id === newSeance.type_id)?.nom?.toLowerCase().includes('cm') ? null : (
                            <select
                                required
                                value={newSeance.groupe_id}
                                onChange={e => setNewSeance({ ...newSeance, groupe_id: e.target.value })}
                                className="w-full p-2 border rounded bg-gray-50"
                            >
                                <option value="">Sélectionner un groupe</option>
                                {groupes.map(g => <option key={g.id} value={g.id}>{g.nom}</option>)}
                            </select>
                        )}
                        {/* Les autres champs (cours, enseignant, durée) */}
                        <select value={newSeance.enseignant_id} onChange={e => setNewSeance({ ...newSeance, enseignant_id: e.target.value })} className="w-full p-2 border rounded bg-gray-50">
                            <option value="">Sélectionner un enseignant</option>
                            {enseignants.map(e => <option key={e.id} value={e.id}>{e.nom}</option>)}
                        </select>
                        <input type="number" required value={newSeance.duree_minutes} onChange={e => setNewSeance({ ...newSeance, duree_minutes: e.target.value })} className="w-full p-2 border rounded bg-gray-50" placeholder="Durée (min)" />
                        <button type="submit" className="bg-teal-600 text-white p-2 rounded hover:bg-teal-700 flex items-center justify-center">
                            <FaPlus className="mr-2" /> Ajouter Séance
                        </button>
                    </form>
                </div>

                {/* Liste des séances */}
                <div className="bg-white shadow-xl rounded-2xl overflow-hidden border border-indigo-100">
                    {loading ? <p className="p-4 text-center">Chargement...</p> : (
                        <table className="min-w-full leading-normal">
                            <thead>
                                <tr>
                                    <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Filière</th>
                                    <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Niveau</th>
                                    <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Cours</th>
                                    <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Type</th>
                                    <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Groupe</th>
                                    <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Section</th>
                                    <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Enseignant</th>
                                    <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Durée</th>
                                    <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {seances.map(s => (
                                    <tr key={s.id} className="hover:bg-gray-50">
                                        <td className="px-5 py-4 border-b border-gray-200 text-sm">{s.filieres?.nom ?? (s.filiere_id ? <span className="text-gray-400">N/A</span> : '')}</td>
                                        <td className="px-5 py-4 border-b border-gray-200 text-sm">{s.niveau ?? <span className="text-gray-400">N/A</span>}</td>
                                        <td className="px-5 py-4 border-b border-gray-200 text-sm">{s.cours?.nom ?? <span className="text-gray-400">N/A</span>}</td>
                                        <td className="px-5 py-4 border-b border-gray-200 text-sm">{s.types_seances?.nom ?? <span className="text-gray-400">N/A</span>}</td>
                                        <td className="px-5 py-4 border-b border-gray-200 text-sm">{s.groupes?.nom ?? <span className="text-gray-400">N/A</span>}</td>
                                        <td className="px-5 py-4 border-b border-gray-200 text-sm">{s.sections?.nom ?? (s.section_id ? <span className="text-gray-400">N/A</span> : '')}</td>
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
        </div>
    )
}
