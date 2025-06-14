'use client'

//import { genererEmploiDuTemps } from '@/src/lib/generation'
import { useEffect, useState } from 'react'
import { supabase } from '@/src/lib/supabaseClient'
import Header from '@/src/components/Header'
import AuthGuard from '@/src/components/AuthGuard'
import moment from 'moment'
import 'moment/locale/fr'
//import fetchEmplois from '@/src/app/emploi-du-temps/page'
import {
    Calendar,
    momentLocalizer,
} from 'react-big-calendar'
import withDragAndDrop from 'react-big-calendar/lib/addons/dragAndDrop'
import 'react-big-calendar/lib/addons/dragAndDrop/styles.css'
import 'react-big-calendar/lib/css/react-big-calendar.css'

moment.locale('fr')
moment.updateLocale('fr', { week: { dow: 0 } }) // dimanche début

const localizer = momentLocalizer(moment)
const DnDCalendar = withDragAndDrop<Emploi>(Calendar)
const [events, setEvents] = useState<Event[]>([])
const [emploisDuTemps, setEmploisDuTemps] = useState<Emploi[]>([])
const [message, setMessage] = useState<string>("")
const [loading, setLoading] = useState<boolean>(false)


type Emploi = {
    id: string
    start: Date
    end: Date
    title: string
    type: 'Cours' | 'TD' | 'TP'
    salle_id: string
    enseignant_id: string
}

export default function EmploiDuTempsPage() {
    const [emploisDuTemps, setEmploisDuTemps] = useState<any[]>([])
    const [generaEvents, setGeneratedEvents] = useState<any[]>([])
    const [events, setEvents] = useState<Emploi[]>([])
    const [loading, setLoading] = useState(false)
    const [message, setMessage] = useState('')
    const [startDate, setStartDate] = useState<string>('2024-06-01')


    const fetchData = async () => {
        const { data, error } = await supabase
            .from('emplois_du_temps')
            .select(`
                id,
                date,
                heure_debut,
                heure_fin,
                type,
                cours: cours_id (id, nom),
                salle: salle_id (id, nom),
                enseignant: enseignant_id (id, nom)
            `)

        if (error) {
            console.error("❌ Erreur Supabase :", error)
            return
        }

        console.log("📦 Données brutes Supabase :", data)

        const parsed = data.map((e: any) => {
            const start = moment(`${e.date} ${e.heure_debut}`).toDate()
            const end = moment(`${e.date} ${e.heure_fin}`).toDate()

            return {
                id: e.id,
                start,
                end,
                title: `${e.cours?.nom || ''} | ${e.salle?.nom || ''} | ${e.enseignant?.nom || ''}`,
                type: e.type,
                salle_id: e.salle?.id,
                enseignant_id: e.enseignant?.id
            }
        })

        setEvents(parsed)
    }



    useEffect(() => {
        // fetchData()
        setEvents([
            {
                id: '1',
                start: new Date('2024-06-17T08:00'),
                end: new Date('2024-06-17T09:30'),
                title: 'Test manuel',
                type: 'Cours',
                salle_id: 'salle-test',
                enseignant_id: 'ens-test'
            }
        ])
    }, [])

    const getColor = (type: string) => {
        switch (type) {
            case 'Cours': return 'orange'
            case 'TD': return 'blue'
            case 'TP': return 'green'
            default: return 'gray'
        }
    }

    const moveEvent = async ({ event, start, end }: any) => {
        const date = moment(start).format('YYYY-MM-DD')
        const heure_debut = moment(start).format('HH:mm')
        const heure_fin = moment(end).format('HH:mm')

        const { error } = await supabase
            .from('emplois_du_temps')
            .update({ date, heure_debut, heure_fin })
            .eq('id', event.id)

        if (!error) {
            const updated = events.map(ev =>
                ev.id === event.id ? { ...ev, start, end } : ev
            )
            setEvents(updated)
        }
    }

    const generatePlanning = async () => {
        if (!confirm("Voulez-vous vraiment générer un nouveau planning ? Cela remplacera l'existant.")) return

        setLoading(true)
        setMessage('Génération en cours...')

        const { data: cours } = await supabase.from('cours').select('*')
        const { data: salles } = await supabase.from('salles').select('*')
        const { data: enseignants } = await supabase.from('enseignants').select('*')

        if (!cours || !salles || !enseignants) {
            setMessage("Erreur lors de la récupération des données.")
            setLoading(false)
            return
        }

        const jours = Array.from({ length: 5 }).map((_, i) =>
            moment(startDate).add(i, 'days').format('YYYY-MM-DD')
        )

        const creneaux = [
            { heure_debut: '08:00', heure_fin: '09:30' },
            { heure_debut: '09:30', heure_fin: '11:00' },
            { heure_debut: '11:00', heure_fin: '12:30' },
            { heure_debut: '12:30', heure_fin: '14:00' },
            { heure_debut: '14:00', heure_fin: '15:30' },
            { heure_debut: '15:30', heure_fin: '17:00' }
        ]

        type Session = {
            cours_id: string
            salle_id: string
            date: string
            heure_debut: string
            heure_fin: string
            enseignant_id: string
            type: 'Cours' | 'TD' | 'TP'
        }

        const emplois: Session[] = []

        const chevauche = (e1: any, e2: any) =>
            e1.date === e2.date &&
            (e1.heure_debut < e2.heure_fin && e2.heure_debut < e1.heure_fin)

        const estValide = (
            salleId: string,
            enseignantId: string,
            date: string,
            heure_debut: string,
            heure_fin: string
        ) => {
            return !emplois.some(e =>
                (e.salle_id === salleId || e.enseignant_id === enseignantId) &&
                chevauche(e, { date, heure_debut, heure_fin })
            )
        }

        const backtrack = (index: number): boolean => {
            if (index === cours.length) return true

            const coursActuel = cours[index]
            const enseignant = enseignants[index % enseignants.length]

            for (let jour of jours) {
                for (let { heure_debut, heure_fin } of creneaux) {
                    for (let salle of salles) {
                        if (estValide(salle.id, enseignant.id, jour, heure_debut, heure_fin)) {
                            emplois.push({
                                cours_id: coursActuel.id,
                                salle_id: salle.id,
                                date: jour,
                                heure_debut,
                                heure_fin,
                                enseignant_id: enseignant.id,
                                type: 'Cours'
                            })

                            if (backtrack(index + 1)) return true
                            emplois.pop()
                        }
                    }
                }
            }

            return false
        }

        const success = backtrack(0)

        if (success) {
            await supabase.from('emplois_du_temps').delete().neq('id', '')
            const { error } = await supabase.from('emplois_du_temps').insert(emplois)
            setMessage(error ? "Erreur d'insertion." : "Planning généré avec succès 🎉")
            fetchData()
        } else {
            setMessage("❌ Impossible de générer un planning valide.")
        }

        setLoading(false)
    }
}
const generateEmplois = async (): Promise<{ success: boolean }> => {
    // Appelle une fonction Supabase, API ou fait une génération locale ici
    const { error } = await supabase.rpc('generer_emplois_du_temps') // Exemple de fonction Supabase
    return { success: !error }
}

const handleEventClick = async (event: any) => {
    const confirmDelete = confirm(`Supprimer le cours "${event.title}" ?`)
    if (!confirmDelete) return

    const { error } = await supabase.from('emplois_du_temps').delete().eq('id', event.id)

    if (error) {
        alert('❌ Erreur lors de la suppression : ' + error.message)
    } else {
        const updated = events.filter(e => e.id !== event.id)
        setEvents(updated)

        alert('✅ Séance supprimée')
    }
}



const handleGenererEmplois = async () => {
    const result = await generateEmplois()

    if (result.success) {
        alert("✅ Créneaux générés avec succès")

        // Rechargement de la table emplois_du_temps
        const { data, error } = await supabase
            .from('emplois_du_temps')
            .select(`
              id,
              date,
              heure_debut,
              heure_fin,
              cours: cours_id (id, nom),
              salle: salle_id (id, nom)
            `)

        if (error) {
            alert("❌ Erreur lors du rechargement des emplois : " + error.message)
            return
        }

        // Traitement des données pour la table
        const emplois = data.map((e: any) => ({
            id: e.id,
            date: e.date,
            heure_debut: e.heure_debut,
            heure_fin: e.heure_fin,
            cours_nom: e.cours?.nom || '',
            salle_nom: e.salle?.nom || ''
        }))

        // Met à jour l'état qui alimente la table HTML
        setEmploisDuTemps(emplois)
    } else {
        alert("❌ Erreur lors de la génération des créneaux")
    }
}

/* const handleGeneration = async () => {
     if (!confirm("Voulez-vous vraiment générer un nouveau planning ? Cela remplacera l'existant.")) return;
 
     setLoading(true);
     setMessage('Génération en cours...');
 
     // 1. Appeler le générateur
     const sessions = await generatePlanning();
 
     // 2. Vider les anciens créneaux
     const { error: deleteError } = await supabase.from('emplois_du_temps').delete().neq('id', '');
     if (deleteError) {
         setMessage("Erreur lors de la suppression de l'ancien planning.");
         setLoading(false);
         return;
     }
 
     // 3. Insérer les nouveaux créneaux
     const { error: insertError } = await supabase.from('emplois_du_temps').insert(sessions);
     if (insertError) {
         setMessage("Erreur lors de l'insertion du nouveau planning.");
         setLoading(false);
         return;
     }
 
     setMessage("Planning généré avec succès 🎉");
 
     // 4. Recharger les données à afficher
     await fetchData()
 
     setLoading(false);
 };
 
*/


const exportPDF = async () => {
    if (typeof window !== 'undefined') {
        const html2pdf = (await import('html2pdf.js')).default;
        const element = document.getElementById('print-zone');
        if (element) {
            html2pdf().from(element).save();
        } else {
            setMessage("Élément PDF non trouvé")
        }
    }
}
const [currentDate, setCurrentDate] = useState(new Date());


// ✅ RETURN EN DEHORS DES FONCTIONS
return (
    <AuthGuard>
        <div className="p-6 max-w-6xl mx-auto">
            <Header />
            <h1 className="text-2xl font-bold mb-6">Emploi du temps (glisser-déposer)</h1>

            <div className="flex flex-wrap items-center gap-4 mb-4">
                <label className="text-sm">Date de début de semaine :</label>
                <input
                    type="date"
                    className="border rounded px-2 py-1"
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                />

                <button
                    onClick={generatePlanning}
                    disabled={loading}
                    className="bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700"
                >
                    {loading ? 'Génération...' : 'Générer automatiquement'}
                </button>




                <button
                    onClick={exportPDF}
                    className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
                >
                    Exporter en PDF
                </button>
            </div>

            <p className="text-sm text-gray-700 mb-4">{message}</p>

            <div id="print-zone" className="bg-white p-4">
                <DnDCalendar
                    localizer={localizer}
                    culture="fr"
                    events={events}
                    startAccessor={(event) => event.start}
                    endAccessor={(event) => event.end}

                    defaultView="week"
                    views={['week']}
                    date={currentDate}
                    defaultDate={currentDate}
                    onNavigate={(date) => setCurrentDate(date)}

                    step={90}
                    timeslots={1}
                    min={new Date(1970, 1, 1, 8, 0)}
                    max={new Date(1970, 1, 1, 17, 0)}
                    onEventDrop={moveEvent}
                    eventPropGetter={(event) => {
                        const e = event as Emploi
                        return {
                            style: {
                                backgroundColor: getColor(e.type),
                                color: 'white',
                                borderRadius: '6px',
                                padding: '4px'
                            }
                        }
                    }}
                    dayLayoutAlgorithm="no-overlap"
                    messages={{
                        today: "Aujourd'hui",
                        previous: 'Précédent',
                        next: 'Suivant',
                        month: 'Mois',
                        week: 'Semaine',
                        day: 'Jour',
                        agenda: 'Agenda',
                        noEventsInRange: 'Aucun cours prévu'
                    }}
                    formats={{
                        timeGutterFormat: (date, _, localizer) => {
                            const start = moment(date)
                            const end = moment(date).add(1.5, 'hours')
                            return `${start.format('HH:mm')} - ${end.format('HH:mm')}`
                        }
                    }}
                />
            </div>

            <style jsx global>{`
                    .rbc-header:nth-child(6),
                    .rbc-header:nth-child(7),
                    .rbc-day-bg:nth-child(6),
                    .rbc-day-bg:nth-child(7),
                    .rbc-day-slot:nth-child(6),
                    .rbc-day-slot:nth-child(7),
                    .rbc-time-content > * > .rbc-day-slot:nth-child(6),
                    .rbc-time-content > * > .rbc-day-slot:nth-child(7) {
                        display: none !important;
                    }
                `}</style>
        </div>
    </AuthGuard>
)
}
