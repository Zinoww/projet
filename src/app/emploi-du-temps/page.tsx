'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/src/lib/supabaseClient'
import { genererEmploiDuTemps } from '@/src/lib/generation'
import TimetableGrid from '@/src/components/TimetableGrid'
import Link from 'next/link'
import { FaArrowLeft, FaCogs, FaChevronLeft, FaChevronRight } from 'react-icons/fa'
import moment from 'moment'
moment.updateLocale('fr', { week: { dow: 0 } }); // 0 = dimanche

// Types pour les données
interface Section {
    id: number
    nom: string
}

type EventData = {
    id: string;
    date: string;
    heure_debut: string;
    heure_fin: string;
    type: string;
    cours: { nom: string };
    enseignants: { nom: string };
    salles: { nom: string };
};

const joursSemaine: { [key: string]: number } = {
    'Dimanche': 1,'Lundi': 2, 'Mardi': 3, 'Mercredi': 4, 'Jeudi': 5,
};

export default function EmploiDuTempsPage() {
    const [sections, setSections] = useState<Section[]>([])
    const [selectedSection, setSelectedSection] = useState<string>('')
    const [events, setEvents] = useState<EventData[]>([])
    const [message, setMessage] = useState<string>('')
    const [loading, setLoading] = useState<boolean>(false)
    const [isGenerating, setIsGenerating] = useState<boolean>(false)
    const [currentWeek, setCurrentWeek] = useState(moment().startOf('week'))
    const [currentNiveau, setCurrentNiveau] = useState<string>('')

    // Fonction utilitaire pour déterminer le niveau principal
    const getMainNiveau = (groupes: any[]): string => {
        if (!groupes || groupes.length === 0) return 'Non spécifié';
        
        // Comptez les occurrences de chaque niveau
        const niveauCounts: Record<string, number> = {};
        groupes.forEach((g: any) => {
            if (g.niveau) {
                niveauCounts[g.niveau] = (niveauCounts[g.niveau] || 0) + 1;
            }
        });
        
        // Retourne le niveau le plus fréquent
        const mostFrequent = Object.entries(niveauCounts).sort((a, b) => b[1] - a[1])[0];
        return mostFrequent ? mostFrequent[0] : groupes[0].niveau || 'Non spécifié';
    };

    // 3. Fonction pour récupérer et formater l'emploi du temps (avec useCallback)
    const fetchTimetable = useCallback(async (sectionId: string) => {
        setLoading(true)
        setMessage('')
        
        // A. Trouver tous les groupes de la section
        const { data: groupes, error: groupesError } = await supabase
            .from('groupes')
            .select('id, niveau')
            .eq('section_id', sectionId);

        if (groupesError) {
            console.error("Erreur lors de la récupération des groupes:", groupesError);
            setLoading(false);
            setEvents([]);
            return;
        }
     
        if (groupes && groupes.length > 0) {
            setCurrentNiveau(getMainNiveau(groupes));
        } else {
            setCurrentNiveau('Non spécifié');
        }
        const groupeIds = groupes?.map(g => g.id) || [];
        console.log("Groupes récupérés:", groupeIds);

        // B. Trouver toutes les séances de ces groupes
        let seances = [];
        let seancesError = null;
        if (groupeIds.length > 0) {
            const result = await supabase
                .from('seances')
                .select('id')
                .in('groupe_id', groupeIds);
            seances = result.data || [];
            seancesError = result.error;
        } else {
            // Aucun groupe, donc pas de séances à récupérer
            setLoading(false);
            setEvents([]);
            return;
        }
        console.log("Séances récupérées:", seances);
        
        if (seancesError || !seances || seances.length === 0) {
            setLoading(false);
            setEvents([]);
            return;
        }
        const seanceIds = seances.map(s => s.id);
        console.log('seanceIds:', seanceIds);
        if (!seanceIds || seanceIds.length === 0) {
            setLoading(false);
            setEvents([]);
            setMessage('Aucune séance trouvée pour cette section.');
            return;
        }

        // C. Récupérer l'emploi du temps pour ces séances
        const { data: timetableData, error: timetableError } = await supabase
            .from('emplois_du_temps')
            .select(`
                id, jour, heure_debut, heure_fin,
                salles ( nom ),
                seances (
                    cours ( nom ),
                    types_seances ( nom ),
                    enseignants ( nom )
                )
            `)
            .in('seance_id', seanceIds);
        
        console.log('TimetableData:', timetableData);
        console.log('TimetableError:', timetableError);
        if (timetableError) {
            setMessage('Erreur lors de la récupération de l\'emploi du temps.')
            console.error("Erreur lors de la récupération de l'emploi du temps:", timetableError);
            setLoading(false);
            return;
        }

        // D. Transformer les données pour le composant TimetableGrid
        const weekStart = currentWeek;
        const formattedEvents = timetableData.map((item: any) => ({
            id: item.id,
            date: weekStart.clone().isoWeekday(joursSemaine[item.jour]).format('YYYY-MM-DD'),
            heure_debut: item.heure_debut ? item.heure_debut.substring(0,5) : '',
            heure_fin: item.heure_fin ? item.heure_fin.substring(0,5) : '',
            type: item.seances?.types_seances?.nom || '',
            cours: { nom: item.seances?.cours?.nom || '' },
            enseignants: { nom: item.seances?.enseignants?.nom || 'N/A' },
            salles: { nom: item.salles?.nom || '' }
        }));
        console.log('formattedEvents:', formattedEvents);

        setEvents(formattedEvents);
        setLoading(false);
    }, [currentWeek]);
    
    // 1. Charger les sections au démarrage
    useEffect(() => {
        const fetchSections = async () => {
            const { data, error } = await supabase.from('sections').select('id, nom').order('nom')
            if (error) {
                setMessage('Erreur lors du chargement des sections.')
                console.error(error)
            } else {
                setSections(data || [])
            }
        }
        fetchSections()
    }, [])

    // 2. Charger l'emploi du temps quand une section est sélectionnée
    useEffect(() => {
        if (selectedSection) {
            fetchTimetable(selectedSection)
        } else {
            setEvents([])
            setMessage('Veuillez sélectionner une section pour voir son emploi du temps.')
        }
    }, [selectedSection, fetchTimetable])

    // 4. Fonction pour lancer la génération
    const handleGenerate = async () => {
        if (!selectedSection) {
            setMessage('Veuillez sélectionner une section avant de lancer la génération.')
            return
        }

        if (!confirm(`Êtes-vous sûr de vouloir remplacer l'emploi du temps actuel de cette section ?`)) {
            return
        }

        setIsGenerating(true)
        const success = await genererEmploiDuTemps(selectedSection, setMessage)
        setIsGenerating(false)

        if (success) {
            await fetchTimetable(selectedSection)
        }
    }

    // Ajout pour PDF pro
    
    const selectedSectionObj = sections.find(s => String(s.id) === selectedSection);
    const sectionName = selectedSectionObj ? selectedSectionObj.nom : '';

    // À adapter selon ta logique métier
    
    const niveau = sectionName.split(' ')[0] || '';
    // Calcul période semaine (dimanche-jeudi)
    const weekStart = currentWeek;
    const dateDebut = weekStart.format('DD/MM/YYYY');
    const dateFin = weekStart.clone().add(4, 'days').format('DD/MM/YYYY'); // Dimanche à Jeudi
    // Log pour vérifier la date du dimanche de la semaine affichée
    console.log('Date du dimanche (colonne 0) :', weekStart.format('YYYY-MM-DD'));

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 to-indigo-100 p-4 sm:p-6 lg:p-8">
            <div className="max-w-7xl mx-auto">
                <header className="mb-8">
                    <div className="flex flex-col sm:flex-row justify-between items-center mb-4 gap-4">
                        <div className="flex items-center gap-4">
                            <img src="/logo.png" alt="Logo" className="h-14 w-14 rounded shadow bg-white object-contain border" onError={e => e.currentTarget.style.display='none'} />
                            <div>
                                <h1 className="text-4xl font-extrabold text-indigo-800 tracking-tight mb-1">Emploi du Temps</h1>
                                <div className="text-gray-600 text-sm font-medium">
                                    Section : <span className="font-semibold">{sectionName || '...'}</span> &nbsp;|&nbsp;
                                    Niveau : <span className="font-semibold">{niveau || '...'}</span> &nbsp;|&nbsp;
                                    Semaine : <span className="font-semibold">{dateDebut} au {dateFin}</span>
                                </div>
                            </div>
                        </div>
                        <Link href="/" className="text-indigo-600 hover:text-indigo-800 flex items-center text-base font-semibold">
                            <FaArrowLeft className="mr-2" /> Retour à l'accueil
                        </Link>
                    </div>
                    {/* Semaine navigation */}
                    <div className="flex items-center justify-center gap-4 mt-2">
                        <button
                          className="p-2 rounded-full bg-indigo-100 hover:bg-indigo-200 text-indigo-700"
                          onClick={() => setCurrentWeek(prev => prev.clone().subtract(1, 'week'))}
                          title="Semaine précédente"
                        >
                          <FaChevronLeft />
                        </button>
                        <span className="text-indigo-700 font-semibold">Semaine du {dateDebut} au {dateFin}</span>
                        <button
                          className="p-2 rounded-full bg-indigo-100 hover:bg-indigo-200 text-indigo-700"
                          onClick={() => setCurrentWeek(prev => prev.clone().add(1, 'week'))}
                          title="Semaine suivante"
                        >
                          <FaChevronRight />
                        </button>
                    </div>
                </header>

                <div className="bg-white p-6 rounded-2xl shadow-xl mb-8 border border-indigo-100">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
                        <div className="md:col-span-2">
                            <label htmlFor="section-select" className="block text-sm font-medium text-gray-700 mb-1">
                                Sélectionner une Section
                            </label>
                            <select
                                id="section-select"
                                value={selectedSection}
                                onChange={(e) => setSelectedSection(e.target.value)}
                                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                disabled={isGenerating}
                            >
                                <option value="">-- Choisissez une section --</option>
                                {sections.map(section => (
                                    <option key={section.id} value={section.id}>{section.nom}</option>
                                ))}
                            </select>
                        </div>
                        <button
                            onClick={handleGenerate}
                            disabled={!selectedSection || isGenerating}
                            className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-700 transition-colors disabled:bg-indigo-300 disabled:cursor-not-allowed"
                        >
                            <FaCogs className={isGenerating ? 'animate-spin' : ''} />
                            {isGenerating ? 'Génération...' : "Générer l'Emploi du Temps"}
                        </button>
                    </div>
                    {message && (
                        <div className={`mt-4 text-center p-3 rounded-lg ${isGenerating ? 'text-blue-700 bg-blue-100' : 'text-gray-700 bg-gray-100'}`}>
                           {message}
                        </div>
                    )}
                </div>

                {loading ? (
                     <div className="text-center py-10 text-gray-500">Chargement de l'emploi du temps...</div>
                ) : events.length > 0 ? (
                    <div className="overflow-x-auto rounded-2xl shadow-lg border border-indigo-100 bg-white">
                        {/* Légende des types de cours */}
                        <div className="p-4 bg-gray-50 border-b border-indigo-100">
                            <h3 className="text-sm font-semibold text-gray-700 mb-3">Légende des types de cours :</h3>
                            <div className="flex flex-wrap gap-3">
                                {[
                                    { type: 'CM', label: 'Cours Magistral' },
                                    { type: 'TD', label: 'Travaux Dirigés' },
                                    { type: 'TP', label: 'Travaux Pratiques' }
                                ].map(({ type, label }) => (
                                    <div key={type} className="flex items-center gap-2">
                                        <span className={`inline-block w-3 h-3 rounded-full ${
                                            type === 'CM' ? 'bg-blue-500' :
                                            type === 'TD' ? 'bg-green-500' :
                                            type === 'TP' ? 'bg-purple-500' : 'bg-gray-500'
                                        }`}></span>
                                        <span className="text-xs text-gray-600 font-medium">{label}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <TimetableGrid
                            events={events}
                            currentDate={weekStart.toDate()}
                            sectionName={sectionName}
                            niveau={currentNiveau}
                            dateDebut={dateDebut}
                            dateFin={dateFin}
                        />
                    </div>
                ) : (
                    <div className="text-center py-10 bg-white rounded-2xl shadow-md border border-indigo-100 text-gray-500">
                        {selectedSection ? "Aucun emploi du temps trouvé pour cette section." : "Veuillez sélectionner une section."}
                    </div>
                )}
            </div>
        </div>
    )
}