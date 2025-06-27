'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/src/lib/supabaseClient'
import { genererEmploiDuTemps } from '@/src/lib/generation'
import TimetableGrid from '@/src/components/TimetableGrid'
import Link from 'next/link'
import { FaArrowLeft, FaCalendarAlt, FaCogs } from 'react-icons/fa'
import moment from 'moment'

// Types pour les données
interface Section {
    id: string
    nom: string
}

type EventData = {
    id: string;
    date: string;
    heure_debut: string;
    type: string;
    cours: { nom: string };
    enseignants: { nom: string };
    salles: { nom: string };
};

const joursSemaine: { [key: string]: number } = {
    'Lundi': 1, 'Mardi': 2, 'Mercredi': 3, 'Jeudi': 4, 'Vendredi': 5, 'Samedi': 6, 'Dimanche': 7
};

export default function EmploiDuTempsPage() {
    const [sections, setSections] = useState<Section[]>([])
    const [selectedSection, setSelectedSection] = useState<string>('')
    const [events, setEvents] = useState<EventData[]>([])
    const [message, setMessage] = useState<string>('')
    const [loading, setLoading] = useState<boolean>(false)
    const [isGenerating, setIsGenerating] = useState<boolean>(false)
    
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
    }, [selectedSection])

    // 3. Fonction pour récupérer et formater l'emploi du temps
    const fetchTimetable = async (sectionId: string) => {
        setLoading(true)
        setMessage('')
        
        // A. Trouver tous les groupes de la section
        const { data: groupes, error: groupesError } = await supabase
            .from('groupes').select('id').eq('section_id', sectionId);

        if (groupesError) {
            console.error("Erreur lors de la récupération des groupes:", groupesError);
            setLoading(false);
            setEvents([]);
            return;
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
                id, jour, heure_debut,
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
        const weekStart = moment().startOf('isoWeek');
        const formattedEvents = timetableData.map((item: any) => ({
            id: item.id,
            date: weekStart.clone().isoWeekday(joursSemaine[item.jour]).format('YYYY-MM-DD'),
            heure_debut: item.heure_debut,
            type: item.seances?.types_seances?.nom || '',
            cours: { nom: item.seances?.cours?.nom || '' },
            enseignants: { nom: item.seances?.enseignants?.nom || 'N/A' },
            salles: { nom: item.salles?.nom || '' }
        }));

        setEvents(formattedEvents);
        setLoading(false);
    }

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
    const selectedSectionObj = sections.find(s => s.id === selectedSection);
    const sectionName = selectedSectionObj ? selectedSectionObj.nom : '';
    // À adapter selon ta logique métier
    const niveau = sectionName.split(' ')[0] || '';
    // Calcul période semaine (lundi-dimanche)
    const weekStart = moment().startOf('isoWeek');
    const dateDebut = weekStart.format('DD/MM/YYYY');
    const dateFin = weekStart.clone().add(6, 'days').format('DD/MM/YYYY');

    return (
        <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
            <div className="max-w-7xl mx-auto">
                <header className="mb-8">
                    <div className="flex justify-between items-center mb-4">
                        <h1 className="text-4xl font-bold text-gray-800 flex items-center">
                            <FaCalendarAlt className="mr-3 text-indigo-500" />
                            Emploi du Temps
                        </h1>
                        <Link href="/" className="text-indigo-600 hover:text-indigo-800 flex items-center">
                            <FaArrowLeft className="mr-2" />
                            Retour à l'accueil
                        </Link>
                    </div>
                </header>

                <div className="bg-white p-6 rounded-xl shadow-md mb-8">
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
                    <TimetableGrid
                        events={events}
                        currentDate={new Date()}
                        sectionName={sectionName}
                        niveau={niveau}
                        dateDebut={dateDebut}
                        dateFin={dateFin}
                    />
                ) : (
                    <div className="text-center py-10 bg-white rounded-xl shadow-md text-gray-500">
                        {selectedSection ? "Aucun emploi du temps trouvé pour cette section." : "Veuillez sélectionner une section."}
                    </div>
                )}
            </div>
        </div>
    )
}