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

interface EventData {
    id: string | number;
    date: string;
    heure_debut: string;
    heure_fin?: string;
    type: string;
    cours: { nom: string };
    enseignants: { nom: string };
    salles: { nom: string };
    groupe: { nom: string };
    section: { nom: string };
}


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



    // Nouvelle version : on ne dépend plus des groupes, on filtre par section/promotion/filière
    const fetchTimetable = useCallback(async (filiereId: string, promotion: string, sectionId: string) => {
        setLoading(true);
        setMessage('');

        if (!sectionId) {
            setEvents([]);
            setLoading(false);
            return;
        }

        // Récupérer toutes les séances de la section, filière et niveau, AVEC le groupe
        const { data: seances, error: seancesError } = await supabase
            .from('seances')
            .select('id, cours(nom), types_seances(nom), enseignants(nom), groupes(id, nom)')
            .eq('section_id', sectionId)
            .eq('niveau', promotion)
            .eq('filiere_id', filiereId);

        console.log('[DEBUG][EDT] Séances récupérées:', seances);

        if (seancesError || !seances || seances.length === 0) {
            setMessage('Aucune séance trouvée pour cette section, filière et niveau.');
            setEvents([]);
            setLoading(false);
            return;
        }

        setCurrentTitle(`Emploi du temps - ${sections.find(s => s.id === sectionId)?.nom || ''} (${promotion})`);

        // Récupérer les emplois du temps pour ces séances
        const { data: emploiData, error: emploiError } = await supabase
            .from('emplois_du_temps')
            .select('*')
            .in('seance_id', seances.map(s => s.id));

        console.log('[DEBUG][EDT] Emplois du temps récupérés:', emploiData);

        if (emploiError || !emploiData || emploiData.length === 0) {
            setMessage(`Aucun emploi du temps trouvé pour cette section. Veuillez générer l'emploi du temps d'abord en cliquant sur "Générer automatiquement".`);
            setEvents([]);
            setLoading(false);
            return;
        }

        // Récupérer les salles utilisées
        const salleIds = Array.from(new Set((emploiData || []).map(e => e.salle_id).filter(Boolean)));
        const { data: salles } = await supabase
            .from('salles')
            .select('id, nom')
            .in('id', salleIds);
        const seancesMap = Object.fromEntries((seances || []).map(s => [s.id, s]));
        const sallesMap = Object.fromEntries((salles || []).map(s => [Number(s.id), s]));

        const weekStart = currentWeek.clone().startOf('week');
        const emploiDataFiltre = emploiData.filter(e => {
            const dayNumber = joursSemaine[e.jour];
            if (dayNumber === undefined) return false;
            const eventDate = weekStart.clone().add(dayNumber, 'days');
            return eventDate.week() === weekStart.week();
        });
        const emploiDataLimite = emploiDataFiltre.length > 0 ? emploiDataFiltre : emploiData;

        const formattedEvents = (emploiDataLimite || []).map((data) => {
            const seance = seancesMap[data.seance_id];
            const salle = sallesMap[Number(data.salle_id)];
            const dayNumber = joursSemaine[data.jour];
            if (dayNumber === undefined || dayNumber === null) {
                return null;
            }
            const eventDate = weekStart.clone().add(dayNumber, 'days');
            // Correction : si pas de groupe mais type CM, afficher 'Section entière'
            let groupeNom = '';
            if (seance.groupes && typeof seance.groupes === 'object' && 'nom' in seance.groupes && seance.groupes.nom) {
                groupeNom = seance.groupes.nom;
            } else if (seance.types_seances && typeof seance.types_seances === 'object' && 'nom' in seance.types_seances && seance.types_seances.nom && seance.types_seances.nom.toLowerCase().includes('cm')) {
                groupeNom = 'Section entière';
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
                groupe: { nom: groupeNom },
                section: { nom: sections.find(s => String(s.id) === String(seance.section_id))?.nom || 'N/A' },
            };
        });
    console.log('[DEBUG][EDT] emploiDataLimite:', emploiDataLimite);
    console.log('[DEBUG][EDT] formattedEvents (avant filter null):', formattedEvents);
    // Correction du typage pour éviter l'erreur de type predicate
    const eventsWithoutNulls = formattedEvents.filter((event): event is NonNullable<typeof event> => event !== null);
    console.log('[DEBUG][EDT] Events envoyés à TimetableGrid:', eventsWithoutNulls);
    setEvents(eventsWithoutNulls);
    setLoading(false);
    }, [currentWeek, sections]);

    useEffect(() => {
        fetchTimetable(selectedFiliere, selectedPromotion, selectedSection);
    }, [selectedFiliere, selectedPromotion, selectedSection, fetchTimetable]);

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

                            {/* Groupe supprimé : on ne sélectionne plus de groupe, emploi du temps généré pour toute la section */}
                        </div>

                        {/* Affichage de la sélection actuelle */}
                        {(selectedFiliere || selectedPromotion || selectedSection) && (
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
                                    {/* Groupe supprimé de l'affichage */}
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
                                if (selectedSection && selectedPromotion) {
                                    success = await genererEmploiDuTemps(selectedSection, setMessage, selectedPromotion, selectedFiliere);
                                } else {
                                    setMessage('Veuillez sélectionner une section et un niveau (promotion).');
                                    setIsGenerating(false);
                                    return;
                                }
                                setIsGenerating(false);
                                if (success) {
                                    setMessage(`Emploi du temps généré avec succès !`);
                                    await fetchTimetable(selectedFiliere, selectedPromotion, selectedSection);
                                }
                            }}
                            disabled={isGenerating || !selectedSection || !selectedPromotion}
                        >
                            <FaCogs /> Générer automatiquement
                        </button>
                    </div>

                    <div className="flex justify-between items-center mb-4">
                        <button onClick={handlePrevWeek} className="flex items-center gap-2 px-4 py-2 bg-white text-indigo-600 rounded-lg shadow hover:bg-gray-50">
                            <FaChevronLeft /> Semaine Préc.
                        </button>
                        <h2 className="text-xl font-semibold text-gray-700">{currentWeek.format('MMMM YYYY')} - Semaine {currentWeek.week()}</h2>
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