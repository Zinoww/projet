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
    'Dimanche': 0,
    'Lundi': 1,
    'Mardi': 2,
    'Mercredi': 3,
    'Jeudi': 4,
    'Vendredi': 5,
    'Samedi': 6
};

export default function EmploiDuTempsPage() {
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

    // Debug logging for events state changes
    useEffect(() => {
        console.log('🔍 DEBUG - emploi-du-temps page - Events state changed:', events);
        console.log('🔍 DEBUG - emploi-du-temps page - Events length:', events.length);
    }, [events]);

    const fetchTimetable = useCallback(async (filiereId: string, promotion: string, sectionId: string, groupeId: string) => {
        setLoading(true);
        setMessage('');

        let targetGroupeIds: string[] = [];

        if (sectionId) {
            const { data, error } = await supabase
                .from('groupes')
                .select('id')
                .eq('section_id', sectionId)

            if (error || !data) {
                setMessage('Erreur: Impossible de charger les groupes de la section.');
                setLoading(false);
                return;
            }
            targetGroupeIds = data.map(g => g.id);
            const section = sections.find(s => s.id === sectionId)

            if (groupeId) {
                const groupe = groupes.find(g => g.id === groupeId)
                setCurrentTitle(`Emploi du temps - ${groupe?.nom || ''}`)
            } else {
                setCurrentTitle(`Emploi du temps - ${section?.nom || ''} (${promotion})`)
            }
        } else {
            setEvents([]);
            setLoading(false);
            return;
        }

        if (targetGroupeIds.length === 0) {
            setEvents([]);
            setMessage('Aucun groupe à afficher pour la sélection actuelle.');
            setLoading(false);
            return;
        }

        console.log('🔍 DEBUG - Recherche de séances pour les groupes:', targetGroupeIds);

        const result = await supabase
            .from('seances')
            .select('id, cours(nom), types_seances(nom), enseignants(nom), groupes(id, nom)')
            .in('groupe_id', targetGroupeIds);

        let seances = result.data;
        const seancesError = result.error;

        console.log('🔍 DEBUG - Résultat de la requête séances:', { seances, seancesError });

        if (seancesError || !seances || seances.length === 0) {
            console.log('⚠️ DEBUG - Aucune séance trouvée');
            setMessage(`Aucune séance trouvée pour ce groupe ou cette section. Groupes: ${targetGroupeIds.join(', ')}`);
            setEvents([]);
            setLoading(false);
            return;
        }

        console.log('✅ DEBUG - Séances trouvées:', seances.length, 'séances');

        console.log('🔍 DEBUG - Recherche d\'emplois du temps pour les séances:', seances.map(s => s.id));

        console.log('🔍 DEBUG - Checking emplois_du_temps table...');
        const { data: allEmploiData } = await supabase
            .from('emplois_du_temps')
            .select('*');

        console.log('🔍 DEBUG - All emplois_du_temps entries:', allEmploiData);
        console.log('🔍 DEBUG - Session IDs to match:', seances.map(s => s.id));

        // Debug: Check if the session IDs in emplois_du_temps match our fetched sessions
        const emploiSeanceIds = allEmploiData?.map(e => e.seance_id) || [];
        const fetchedSeanceIds = seances.map(s => s.id);
        const matchingIds = emploiSeanceIds.filter(id => fetchedSeanceIds.includes(id));
        const nonMatchingIds = emploiSeanceIds.filter(id => !fetchedSeanceIds.includes(id));

        console.log('🔍 DEBUG - Matching session IDs:', matchingIds);
        console.log('🔍 DEBUG - Non-matching session IDs in emplois_du_temps:', nonMatchingIds);
        console.log('🔍 DEBUG - Current week start:', currentWeek.clone().startOf('isoWeek').format('YYYY-MM-DD'));
        console.log('🔍 DEBUG - Current week number:', currentWeek.isoWeek());

        // First try to find timetable entries for the current sessions
        const { data: emploiData, error } = await supabase
            .from('emplois_du_temps')
            .select('*')
            .in('seance_id', seances.map(s => s.id));

        console.log('🔍 DEBUG - Résultat de la requête emplois_du_temps:', { emploiData, error });

        let finalEmploiData = emploiData;

        // If no timetable entries found for current sessions, try to find entries for the current section's groups
        if (error || !emploiData || emploiData.length === 0) {
            console.log('⚠️ DEBUG - Aucun emploi du temps trouvé pour les séances actuelles, recherche pour la section...');

            // Get all sessions for the current section
            const { data: allSectionSeances, error: sectionSeancesError } = await supabase
                .from('seances')
                .select('id, cours(nom), types_seances(nom), enseignants(nom), groupes(id, nom)')
                .in('groupe_id', targetGroupeIds);

            if (!sectionSeancesError && allSectionSeances && allSectionSeances.length > 0) {
                console.log('🔍 DEBUG - Toutes les séances de la section:', allSectionSeances.length);

                const { data: sectionEmploiData, error: sectionError } = await supabase
                    .from('emplois_du_temps')
                    .select('*')
                    .in('seance_id', allSectionSeances.map(s => s.id));

                if (!sectionError && sectionEmploiData && sectionEmploiData.length > 0) {
                    console.log('✅ DEBUG - Emploi du temps trouvé pour la section:', sectionEmploiData.length, 'entrées');
                    finalEmploiData = sectionEmploiData;
                    // Update seances to include all section sessions for proper mapping
                    seances = allSectionSeances;
                } else {
                    console.log('⚠️ DEBUG - Aucune entrée emploi du temps pour les séances de la section');
                }
            } else {
                console.log('⚠️ DEBUG - Aucune séance trouvée pour la section');
            }
        }

        // If still no data found, show a helpful message
        if (!finalEmploiData || finalEmploiData.length === 0) {
            console.log('⚠️ DEBUG - Aucun emploi du temps trouvé pour cette section');
            setMessage(`Aucun emploi du temps trouvé pour cette section. Veuillez générer l'emploi du temps d'abord en cliquant sur "Générer automatiquement".`);
            setEvents([]);
            setLoading(false);
            return;
        }

        console.log('✅ DEBUG - Emploi du temps final:', finalEmploiData.length, 'entrées');

        console.log('✅ DEBUG - Emplois du temps trouvés:', finalEmploiData.length, 'entrées');

        const weekStart = currentWeek.clone().startOf('isoWeek');
        const emploiDataFiltre = finalEmploiData.filter(e => {
            const dayNumber = joursSemaine[e.jour];
            if (dayNumber === undefined) return false;
            const eventDate = weekStart.clone().add(dayNumber, 'days');
            return eventDate.isoWeek() === weekStart.isoWeek();
        });

        console.log('🔍 DEBUG - Week filtering:');
        console.log('🔍 DEBUG - Total emplois_du_temps entries:', finalEmploiData.length);
        console.log('🔍 DEBUG - Entries after week filter:', emploiDataFiltre.length);
        console.log('🔍 DEBUG - Filtered entries:', emploiDataFiltre);

        // TEMPORARY: Show all entries regardless of week to test
        const emploiDataLimite = emploiDataFiltre.length > 0 ? emploiDataFiltre : finalEmploiData;
        console.log('🔍 DEBUG - Using entries:', emploiDataLimite.length, '(week filtered or all)');

        const salleIds = Array.from(new Set((emploiDataLimite || []).map(e => e.salle_id).filter(Boolean)));
        const { data: salles } = await supabase
            .from('salles')
            .select('id, nom')
            .in('id', salleIds);
        const seancesMap = Object.fromEntries((seances || []).map(s => [s.id, s]));
        const sallesMap = Object.fromEntries((salles || []).map(s => [Number(s.id), s]));

        console.log('🔍 DEBUG - Données avant formatage:');
        console.log('emploiDataLimite:', emploiDataLimite);
        console.log('seancesMap:', seancesMap);
        console.log('sallesMap:', sallesMap);

        const formattedEvents = (emploiDataLimite || []).map((data) => {
            const seance = seancesMap[data.seance_id];
            const salle = sallesMap[Number(data.salle_id)];
            const dayNumber = joursSemaine[data.jour];

            console.log('🔍 DEBUG - Traitement data:', data);
            console.log('🔍 DEBUG - Seance trouvée:', seance);
            console.log('🔍 DEBUG - Salle trouvée:', salle);
            console.log('🔍 DEBUG - Jour:', data.jour, '-> dayNumber:', dayNumber);

            if (dayNumber === undefined || dayNumber === null) {
                console.log('⚠️ DEBUG - Jour invalide, skipping:', data.jour);
                return null;
            }

            const eventDate = weekStart.clone().add(dayNumber, 'days');
            const event = {
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

            console.log('✅ DEBUG - Event formaté:', event);
            return event;
        });

        const eventsWithoutNulls = formattedEvents.filter((event): event is EventData => event !== null);

        console.log('🔍 DEBUG - Final filtering:');
        console.log('🔍 DEBUG - eventsWithoutNulls:', eventsWithoutNulls.length);
        console.log('🔍 DEBUG - groupeId:', groupeId);

        const finalEvents = eventsWithoutNulls.filter(event => {
            console.log('🔍 DEBUG - Filtering event:', event.id, 'groupeId:', groupeId);

            if (!groupeId) {
                console.log('🔍 DEBUG - No groupeId filter, keeping event');
                return true;
            }

            // Find the corresponding timetable entry to get the seance_id
            const emploiEntry = finalEmploiData.find(e => e.id === event.id);
            console.log('🔍 DEBUG - emploiEntry found:', emploiEntry);

            if (!emploiEntry) {
                console.log('🔍 DEBUG - No emploiEntry found, filtering out');
                return false;
            }

            const seance = seancesMap[emploiEntry.seance_id];
            console.log('🔍 DEBUG - seance found:', seance);
            console.log('🔍 DEBUG - seance.groupes:', seance?.groupes);

            if (!seance || !seance.groupes) {
                console.log('🔍 DEBUG - No seance or groupes, filtering out');
                return false;
            }

            const match = String(seance.groupes.id) === String(groupeId);
            console.log('🔍 DEBUG - Group match:', match, 'seance.groupes.id:', seance.groupes.id, 'groupeId:', groupeId);

            return match;
        });

        console.log('🔍 DEBUG - finalEvents after filtering:', finalEvents.length);

        // If no events match the selected group, show all events for the section
        const eventsToShow = finalEvents.length > 0 ? finalEvents : eventsWithoutNulls;
        console.log('🔍 DEBUG - Events to show:', eventsToShow.length, finalEvents.length === 0 ? '(showing all section events)' : '(filtered by group)');

        setEvents(eventsToShow);
        setLoading(false);
    }, [currentWeek, groupes, sections]);

    useEffect(() => {
        fetchTimetable(selectedFiliere, selectedPromotion, selectedSection, selectedGroupe);
    }, [selectedFiliere, selectedPromotion, selectedSection, selectedGroupe, fetchTimetable]);

    const handlePrevWeek = () => setCurrentWeek(currentWeek.clone().subtract(1, 'week'));
    const handleNextWeek = () => setCurrentWeek(currentWeek.clone().add(1, 'week'));

    // Affichage du message d’explication
    return (
        <AuthGuard>
            <div className="min-h-screen bg-gradient-to-br from-gray-50 to-indigo-100 p-4 sm:p-6 lg:p-8">
                <main className="max-w-7xl mx-auto">
                    <div className="flex justify-between items-center mb-6">
                        <Link href="/" className="flex items-center gap-2 text-indigo-600 hover:text-indigo-800">
                            <FaArrowLeft />
                            Retour à l accueil
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
                                <button
                                    onClick={() => {
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


                        <button
                            className="mt-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2 disabled:opacity-50"
                            onClick={async () => {
                                setIsGenerating(true);
                                setMessage('Génération en cours...');
                                let success = false;
                                if (selectedSection) {
                                    if (selectedGroupe) {
                                        setMessage(`Génération pour toute la section ${sections.find(s => String(s.id) === String(selectedSection))?.nom || selectedSection} (incluant le groupe ${groupes.find(g => String(g.id) === String(selectedGroupe))?.nom || selectedGroupe})...`);
                                    }
                                    success = await genererEmploiDuTemps(selectedSection, setMessage, selectedPromotion);
                                } else {
                                    setMessage('Veuillez sélectionner au moins une section.');
                                    setIsGenerating(false);
                                    return;
                                }
                                setIsGenerating(false);
                                if (success) {
                                    setMessage(`Emploi du temps généré avec succès !`);
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
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 my-4 text-yellow-800">
                            <pre style={{ whiteSpace: 'pre-wrap' }}>{message}</pre>
                        </div>
                    )}

                    {loading ? (
                        <div className="text-center py-10">
                            <p className="text-indigo-600">Chargement de l&apos;emploi du temps&hellip;</p>
                        </div>
                    ) : (
                        <TimetableGrid
                            events={events}
                            currentDate={currentWeek.toDate()}
                            sectionName={selectedSection ? sections.find(s => String(s.id) === String(selectedSection))?.nom : undefined}
                            niveau={selectedPromotion}
                            filiereName={selectedFiliere ? filieres.find(f => String(f.id) === String(selectedFiliere))?.nom : undefined}
                            groupeName={selectedGroupe ? groupes.find(g => String(g.id) === String(selectedGroupe))?.nom : undefined}
                        />
                    )}
                </main>
            </div>
        </AuthGuard>
    )
}