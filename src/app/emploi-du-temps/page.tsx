'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/src/lib/supabaseClient'
import { genererEmploiDuTemps } from '@/src/lib/generation'
import TimetableGrid from '@/src/components/TimetableGrid'
import Link from 'next/link'
import { FaArrowLeft, FaCogs, FaChevronLeft, FaChevronRight } from 'react-icons/fa'
import moment from 'moment'
import 'moment/locale/fr'
import AuthGuard from '@/src/components/AuthGuard'
import { useHierarchicalSelection } from '@/src/hooks/useHierarchicalSelection'
moment.updateLocale('fr', { week: { dow: 0 } }); // 0 = dimanche

type EventData = {
    id: string;
    date: string;
    heure_debut: string;
    heure_fin: string;
    type: string;
    cours: { nom: string };
    enseignants: { nom: string };
    salles: { nom: string };
    groupe: { nom: string };
};

const joursSemaine: { [key: string]: number } = {
    'Lundi': 1,
    'Mardi': 2,
    'Mercredi': 3,
    'Jeudi': 4,
    'Vendredi': 5,
    'Samedi': 6,
    'Dimanche': 7
};

export default function EmploiDuTempsPage() {
    // Utiliser le hook de sélection hiérarchique
    const {
        filieres,
        promotions,
        sections,
        groupes,
        selectedFiliere,
        selectedPromotion,
        selectedSection,
        selectedGroupe,
        setSelectedFiliere,
        setSelectedPromotion,
        setSelectedSection,
        setSelectedGroupe,
        loading: selectionLoading
    } = useHierarchicalSelection()
    
    const [events, setEvents] = useState<EventData[]>([])
    const [message, setMessage] = useState<string>('')
    const [loading, setLoading] = useState<boolean>(true)
    const [isGenerating, setIsGenerating] = useState<boolean>(false)
    const [currentWeek, setCurrentWeek] = useState(moment().startOf('week'))
    const [currentTitle, setCurrentTitle] = useState<string>('Emploi du temps')
    const [nombreSeances, setNombreSeances] = useState(10);

    // Fonction fetchTimetable avec useCallback pour éviter les re-renders infinis
    const fetchTimetable = useCallback(async (filiereId: string, promotion: string, sectionId: string, groupeId: string) => {
        console.log('fetchTimetable appelé avec:', { filiereId, promotion, sectionId, groupeId });
        setLoading(true);
        setMessage('');

        let targetGroupeIds: string[] = [];

        if (groupeId) {
            // Un groupe spécifique est sélectionné
            targetGroupeIds = [groupeId];
            const groupe = groupes.find(g => g.id === groupeId)
            setCurrentTitle(`Emploi du temps - ${groupe?.nom || ''}`)
        } else if (sectionId) {
            // Une section est sélectionnée, prendre tous les groupes de cette section et promotion
            const { data, error } = await supabase
                .from('groupes')
                .select('id')
                .eq('section_id', sectionId)
                .eq('niveau', promotion)
            
            if (error || !data) {
                setMessage('Erreur: Impossible de charger les groupes de la section.');
                setLoading(false);
                return;
            }
            targetGroupeIds = data.map(g => g.id);
            const section = sections.find(s => s.id === sectionId)
            setCurrentTitle(`Emploi du temps - ${section?.nom || ''} (${promotion})`)
        } else {
            // Rien n'est sélectionné pour l'affichage
            setEvents([]);
            setLoading(false);
            return;
        }

        console.log('targetGroupeIds:', targetGroupeIds);
        if (targetGroupeIds.length === 0) {
            setEvents([]);
            setMessage('Aucun groupe à afficher pour la sélection actuelle.');
            setLoading(false);
            return;
        }

        // 1. Récupérer les séances du ou des groupes sélectionnés
        let groupesIdsToFetch = targetGroupeIds;
        console.log('groupesIdsToFetch:', groupesIdsToFetch);
        console.log('groupesIdsToFetch type:', typeof groupesIdsToFetch[0]);
        const { data: seances, error: seancesError } = await supabase
            .from('seances')
            .select('id, cours(nom), types_seances(nom), enseignants(nom), groupes(id, nom)')
            .in('groupe_id', groupesIdsToFetch);
        console.log('seances trouvées:', seances);
        console.log('Séances trouvées pour ce groupe:', seances);
        console.log('seancesError:', seancesError);
        if (seancesError || !seances || seances.length === 0) {
            setMessage('Aucune séance trouvée pour ce groupe ou cette section.');
            setEvents([]);
            setLoading(false);
            return;
        }
        // 2. Récupérer les emplois du temps pour ces séances
        const seanceIds = seances.map(s => s.id); // Garder en string
        console.log('seanceIds:', seanceIds);
        const { data: emploiData, error } = await supabase
            .from('emplois_du_temps')
            .select('*')
            .in('seance_id', seanceIds);
        console.log('emploiData:', emploiData);
        console.log('emploiError:', error);
        if (error || !emploiData || emploiData.length === 0) {
            if (seances && seances.length > 0) {
                setMessage(`Aucun emploi du temps trouvé pour ${seances.length} séance(s). Veuillez générer l'emploi du temps d'abord.`);
            } else {
                setMessage('Erreur lors du chargement de l\'emploi du temps.');
            }
            setEvents([]);
            setLoading(false);
            return;
        }
        // 3. Récupérer les salles concernées
        const salleIds = Array.from(new Set((emploiData || []).map(e => e.salle_id).filter(Boolean)));
        const { data: salles } = await supabase
            .from('salles')
            .select('id, nom')
            .in('id', salleIds);
        const seancesMap = Object.fromEntries((seances || []).map(s => [s.id, s]));
        const sallesMap = Object.fromEntries((salles || []).map(s => [Number(s.id), s]));
        const weekStart = currentWeek.clone().startOf('isoWeek');
        console.log('emploiData', emploiData);
        console.log('seances', seances);
        const formattedEvents = (emploiData || []).map(data => {
            const seance = seancesMap[data.seance_id];
            const salle = sallesMap[Number(data.salle_id)];
            if (!seance) return null;
            const dayNumber = joursSemaine[data.jour];
            let eventDate;
            if (!dayNumber) {
                console.error(`Jour non reconnu: ${data.jour}`);
                return null;
            } else {
                eventDate = weekStart.clone().add(dayNumber - 1, 'days');
            }
            return {
                id: data.id,
                date: eventDate.format('YYYY-MM-DD'),
                heure_debut: data.heure_debut ? data.heure_debut.substring(0, 5) : '00:00',
                heure_fin: data.heure_fin ? data.heure_fin.substring(0, 5) : '00:00',
                type: typeof seance.types_seances === 'object' && seance.types_seances !== null && 'nom' in seance.types_seances ? (seance.types_seances as { nom: string }).nom : 'N/A',
                cours: { nom: typeof seance.cours === 'object' && seance.cours !== null && 'nom' in seance.cours ? (seance.cours as { nom: string }).nom : 'N/A' },
                enseignants: { nom: typeof seance.enseignants === 'object' && seance.enseignants !== null && 'nom' in seance.enseignants ? (seance.enseignants as { nom: string }).nom : 'N/A' },
                salles: { nom: salle ? salle.nom : 'N/A' },
                groupe: { nom: typeof seance.groupes === 'object' && seance.groupes !== null && 'nom' in seance.groupes ? (seance.groupes as { nom: string }).nom : 'N/A' },
            };
        })
        // D'abord, filtre les nulls
        .filter((event): event is EventData => event !== null)
        // Puis filtre pour n'afficher que le groupe sélectionné si besoin
        .filter(event => !selectedGroupe || event.groupe.nom === (groupes.find(g => String(g.id) === String(selectedGroupe))?.nom || ''));
        console.log('formattedEvents', formattedEvents);
        setEvents(formattedEvents);
        setLoading(false);
    }, [currentWeek, groupes, sections]);
    
    // Recharger l'emploi du temps quand la sélection change
    useEffect(() => {
        console.log('Selection changed:', { selectedFiliere, selectedPromotion, selectedSection, selectedGroupe });
        console.log('Available data:', { filieres: filieres.length, sections: sections.length, groupes: groupes.length });
        console.log('Filieres:', filieres);
        console.log('Sections:', sections);
        console.log('Groupes:', groupes);
        fetchTimetable(selectedFiliere, selectedPromotion, selectedSection, selectedGroupe);
    }, [selectedFiliere, selectedPromotion, selectedSection, selectedGroupe, fetchTimetable]);
    
    const handlePrevWeek = () => setCurrentWeek(currentWeek.clone().subtract(1, 'week'));
    const handleNextWeek = () => setCurrentWeek(currentWeek.clone().add(1, 'week'));

    return (
        <AuthGuard>
        <div className="min-h-screen bg-gradient-to-br from-gray-50 to-indigo-100 p-4 sm:p-6 lg:p-8">
                <main className="max-w-7xl mx-auto">
                    <div className="flex justify-between items-center mb-6">
                        <Link href="/" className="flex items-center gap-2 text-indigo-600 hover:text-indigo-800">
                            <FaArrowLeft />
                            Retour à l'accueil
                        </Link>
                        <h1 className="text-2xl font-bold text-gray-800">{currentTitle}</h1>
                        <div className="w-1/3"></div>
                    </div>

                    <div className="bg-white p-6 rounded-2xl shadow-xl mb-8 border border-indigo-100">
                        <h2 className="text-lg font-semibold mb-4 text-gray-800">Sélection hiérarchique</h2>
                        
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                            {/* Filière */}
                            <div>
                                <label htmlFor="filiere" className="block text-sm font-medium text-gray-700 mb-2">Filière :</label>
                                <select id="filiere" value={selectedFiliere}
                                    onChange={(e) => {
                                        setSelectedFiliere(e.target.value);
                                        setSelectedPromotion('');
                                        setSelectedSection('');
                                        setSelectedGroupe('');
                                    }}
                                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                    disabled={selectionLoading || isGenerating}>
                                    <option value="">Sélectionner une filière</option>
                                    {filieres.map((filiere) => (
                                        <option key={filiere.id} value={filiere.id}>{filiere.nom}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Promotion */}
                            <div>
                                <label htmlFor="promotion" className="block text-sm font-medium text-gray-700 mb-2">Promotion (Niveau) :</label>
                                <select id="promotion" value={selectedPromotion}
                                    onChange={(e) => {
                                        setSelectedPromotion(e.target.value);
                                        setSelectedSection('');
                                        setSelectedGroupe('');
                                    }}
                                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                    disabled={selectionLoading || isGenerating || !selectedFiliere}>
                                    <option value="">Sélectionner une promotion</option>
                                    {promotions.map((promotion) => (
                                        <option key={promotion} value={promotion}>{promotion}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Section */}
                            <div>
                                <label htmlFor="section" className="block text-sm font-medium text-gray-700 mb-2">Section :</label>
                                <select id="section" value={selectedSection}
                                    onChange={(e) => {
                                        setSelectedSection(e.target.value);
                                        setSelectedGroupe('');
                                    }}
                                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                    disabled={selectionLoading || isGenerating || !selectedPromotion}>
                                    <option value="">Afficher toute la promotion</option>
                                    {sections.map((section) => (
                                        <option key={section.id} value={section.id}>{section.nom}</option>
                                    ))}
                                </select>
                                </div>

                             {/* Groupe */}
                             <div>
                                <label htmlFor="groupe" className="block text-sm font-medium text-gray-700 mb-2">Groupe :</label>
                                <select id="groupe" value={selectedGroupe}
                                    onChange={(e) => setSelectedGroupe(e.target.value)}
                                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                    disabled={selectionLoading || isGenerating || !selectedSection}>
                                    <option value="">Afficher toute la section</option>
                                    {groupes.map((groupe) => (
                                        <option key={groupe.id} value={groupe.id}>{groupe.nom}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        
                        {/* Affichage de la sélection actuelle */}
                        {(selectedFiliere || selectedPromotion || selectedSection || selectedGroupe) && (
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                                <h3 className="font-semibold text-blue-800 mb-2">Sélection actuelle :</h3>
                                <p className="text-blue-700">
                                    <strong>Filière :</strong> {
                                        selectedFiliere ?
                                          (filieres.find(f => String(f.id) === String(selectedFiliere))?.nom || `ID: ${selectedFiliere}`) :
                                          ''
                                    } |
                                    <strong> Promotion :</strong> {selectedPromotion} | 
                                    <strong> Section :</strong> {
                                        selectedSection ?
                                          (sections.find(s => String(s.id) === String(selectedSection))?.nom || `ID: ${selectedSection}`) :
                                          ''
                                    }
                                    {selectedGroupe && ` | Groupe : ${groupes.find(g => String(g.id) === String(selectedGroupe))?.nom || `ID: ${selectedGroupe}`}`}
                                </p>
                                {selectionLoading && (
                                    <p className="text-xs text-blue-600 mt-2">Chargement des données...</p>
                                )}
                                {/* Debug info */}
                                <div className="mt-2 text-xs text-gray-600">
                                    <p>Debug - IDs: Filière={selectedFiliere}, Section={selectedSection}, Groupe={selectedGroupe}</p>
                                    <p>Debug - Arrays: Filières={filieres.length}, Sections={sections.length}, Groupes={groupes.length}</p>
                                    {filieres.length > 0 && <p>Debug - Filières disponibles: {filieres.map(f => `${f.id}:${f.nom}`).join(', ')}</p>}
                                    {sections.length > 0 && <p>Debug - Sections disponibles: {sections.map(s => `${s.id}:${s.nom}`).join(', ')}</p>}
                                    {groupes.length > 0 && <p>Debug - Groupes disponibles: {groupes.map(g => `${g.id}:${g.nom}`).join(', ')}</p>}
                                </div>
                                <button 
                                    onClick={() => {
                                        console.log('Forcing reload...');
                                        setSelectedFiliere('');
                                        setSelectedPromotion('');
                                        setSelectedSection('');
                                        setSelectedGroupe('');
                                        setTimeout(() => {
                                            setSelectedFiliere(selectedFiliere);
                                            setSelectedPromotion(selectedPromotion);
                                            setSelectedSection(selectedSection);
                                            setSelectedGroupe(selectedGroupe);
                                        }, 100);
                                    }}
                                    className="mt-2 px-2 py-1 bg-gray-200 text-gray-700 text-xs rounded hover:bg-gray-300"
                                >
                                    Recharger les données
                                </button>
                            </div>
                        )}
                        
                        <div className="mb-4 flex items-center gap-3">
                            <label htmlFor="nombre-seances" className="block text-sm font-medium text-gray-700">Nombre de séances à planifier :</label>
                            <input
                                id="nombre-seances"
                                type="number"
                                min={1}
                                value={nombreSeances}
                                onChange={e => setNombreSeances(Number(e.target.value))}
                                className="w-24 p-2 border border-gray-300 rounded-md"
                            />
                    </div>
                        <button
                            className="mt-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2 disabled:opacity-50"
                            onClick={async () => {
                                setIsGenerating(true);
                                setMessage('Génération en cours...');
                                let success = false;
                                if (selectedSection) {
                                    // Générer pour toute la section, même si un groupe spécifique est sélectionné
                                    if (selectedGroupe) {
                                        setMessage(`Génération pour toute la section ${sections.find(s => String(s.id) === String(selectedSection))?.nom || selectedSection} (incluant le groupe ${groupes.find(g => String(g.id) === String(selectedGroupe))?.nom || selectedGroupe})...`);
                                    }
                                    success = await genererEmploiDuTemps(selectedSection, setMessage, selectedPromotion, nombreSeances);
                                } else {
                                    setMessage('Veuillez sélectionner au moins une section.');
                                    setIsGenerating(false);
                                    return;
                                }
                                setIsGenerating(false);
                                if (success) {
                                    setMessage('Emploi du temps généré avec succès !');
                                    // Recharger l'emploi du temps après génération
                                    await fetchTimetable(selectedFiliere, selectedPromotion, selectedSection, selectedGroupe);
                                }
                            }}
                            disabled={isGenerating || !selectedSection}
                        >
                            <FaCogs /> Générer automatiquement
                        </button>
                    </div>

                    <div className="flex justify-between items-center mb-4">
                        <button onClick={handlePrevWeek} className="flex items-center gap-2 px-4 py-2 bg-white text-indigo-600 rounded-lg shadow hover:bg-gray-50">
                            <FaChevronLeft /> Semaine Préc.
                        </button>
                        <h2 className="text-xl font-semibold text-gray-700">{currentWeek.format('MMMM YYYY')} - Semaine {currentWeek.isoWeek()}</h2>
                        <button onClick={handleNextWeek} className="flex items-center gap-2 px-4 py-2 bg-white text-indigo-600 rounded-lg shadow hover:bg-gray-50">
                            Semaine Suiv. <FaChevronRight />
                        </button>
                    </div>

                    {message && (
                        <div className="mb-4 p-3 rounded-md text-sm text-red-700 bg-red-100 border border-red-300">
                           {message}
                        </div>
                    )}

                {loading ? (
                        <div className="text-center py-10">
                            <p className="text-indigo-600">Chargement de l'emploi du temps...</p>
                    </div>
                ) : (
                        <TimetableGrid events={events} currentDate={currentWeek.toDate()} />
                )}
                </main>
            </div>
        </AuthGuard>
    )
}