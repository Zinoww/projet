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
import { useRouter } from 'next/navigation'
import React from 'react';


type Emploi = {
    id: string
    start: Date
    end: Date
    title: string
    type: 'Cours' | 'TD' | 'TP'
    salle_id: string
    cours_id: string
    enseignant_id: string
}

export default function EmploiDuTempsPage() {

    // ...all your useState hooks and other logic...

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

        // ...rest of generatePlanning logic...
    }


    const [emploisDuTemps, setEmploisDuTemps] = useState<any[]>([])
    const [generaEvents, setGeneratedEvents] = useState<any[]>([])
    type CalendarEvent = {
        id: string;
        start: Date;
        end: Date;
        title: string;
        type: string;
        salle_id: string;
        cours_id: string;
        enseignant_id: string;
    };
    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [loading, setLoading] = useState(false)
    const [message, setMessage] = useState('')
    const [startDate, setStartDate] = useState<string>('2024-06-01')
    const router = useRouter()


    const handleDoubleClickEvent = async (event: any) => {
        const confirmDelete = confirm(`Supprimer ce créneau : ${event.title} ?`)
        if (!confirmDelete) return

        const { error } = await supabase
            .from('emplois_du_temps')
            .delete()
            .eq('id', event.id) // ou autre champ identifiant   

        if (error) {
            alert("Erreur lors de la suppression.")
        } else {
            alert("Créneau supprimé ✅")
            fetchData() // recharge les événements
        }
    }

    const fetchData = async () => {
        const { data, error } = await supabase
            .from('emplois_du_temps')
            .select(`
            id,
            date,
            heure_debut,
            heure_fin,
            type,
            cours (id, nom),
            salles (id, nom),
            enseignants (id, nom)
        `);


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
                enseignant_id: e.enseignant?.id,
                cours_id: e.cours_id,
            }
        })

        const events = data.map(event => {
            let color = '#3788d8'; // Couleur par défaut

            if (event.type === 'CM') color = '#007bff'; // bleu
            if (event.type === 'TD') color = '#28a745'; // vert
            if (event.type === 'TP') color = '#ffc107'; // jaune

            return {
                ...event,
                title: `[${event.type}] ${event.title}`,
                backgroundColor: color
            };
        });


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
                cours_id: 'cour-test',
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

        // 🔧 Extraction des données depuis l'objet event
        const cours_id = event.cours_id
        const salle_id = event.salle_id
        const enseignant_id = event.enseignant_id
        const niveau_id = event.niveau_id
        const specialite_id = event.specialite_id
        const groupe_id = event.groupe_id

        // Pour la vérification : on suppose que "jour" = "date" et "heure" = "heure_debut"
        const jour = date
        const heure = heure_debut

        const { data: existing, error: checkError } = await supabase
            .from('emplois_du_temps')
            .select('*')
            .eq('cours_id', cours_id)
            .eq('salle_id', salle_id)
            .eq('jour', jour)
            .eq('heure', heure)

        if (checkError) {
            console.error(checkError)
            alert("Erreur de vérification : " + checkError.message)
            return
        }

        if (existing && existing.length > 0) {
            console.warn('Créneau déjà pris, insertion ignorée.')
            return // évite le doublon
        }

        // ➕ Insertion réelle
        const { error } = await supabase.from('emplois_du_temps').insert([{
            cours_id,
            enseignant_id,
            salle_id,
            jour,
            heure,
            niveau_id,
            specialite_id,
            groupe_id
        }])

        if (error) {
            console.error(error)
            alert("Erreur d'insertion : " + error.message)
        }
    }

    // Remove this duplicate generatePlanning function from the outer scope.
    // The correct generatePlanning function is already defined inside your component and has access to setMessage.

    const generateEmplois = async (): Promise<{ success: boolean }> => {
        // Appelle une fonction Supabase, API ou fait une génération locale ici
        const { error } = await supabase.rpc('generer_emplois_du_temps') // Exemple de fonction Supabase
        return { success: !error }
    }

    const handleEventClick = async (event: any) => {
        const confirmDelete = confirm(`Supprimer le cours "${event.title}" ?`);
        if (!confirmDelete) return;

        const { error } = await supabase.from('emplois_du_temps').delete().eq('id', event.id);

        if (error) {
            alert('❌ Erreur lors de la suppression : ' + error.message);
        } else {
            // Typage explicite du paramètre e
            setEvents((prevEvents: any[]) => prevEvents.filter((e: any) => e.id !== event.id));

            alert('✅ Séance supprimée');
        }
    };

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
                  type,
                  cours: cours_id (id, nom),
                  salles: salle_id (id, nom)
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
    const onEventDrop = async ({ event, start, end }: any) => {
        const newDate = moment(start).format('YYYY-MM-DD')
        const newStart = moment(start).format('HH:mm')
        const newEnd = moment(end).format('HH:mm')

        const { error } = await supabase
            .from('emplois_du_temps')
            .update({
                date: newDate,
                heure_debut: newStart,
                heure_fin: newEnd,
            })
            .eq('id', event.id)

        if (!error) {
            setEvents(prev =>
                prev.map(e =>
                    e.id === event.id ? { ...e, start, end } : e
                )
            )
        } else {
            alert("Erreur lors du déplacement du créneau.")
        }
    }

    const [currentDate, setCurrentDate] = useState(new Date());
    const DnDCalendar = withDragAndDrop(Calendar)
    const localizer = momentLocalizer(moment)

    // ✅ RETURN inside the function body
    return (
        <AuthGuard>
            <div className="p-6 max-w-6xl mx-auto">
                <Header />
                <h1 className="text-2xl font-bold mb-6">Emploi du temps (glisser-déposer)</h1>
                <button
                    onClick={() => router.push('/')}
                    className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600"
                >
                    ⬅️ Retour à l’accueil
                </button>
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
                        culture="fr"
                        startAccessor={(event) => new Date((event as Emploi).start)}
                        endAccessor={(event) => new Date((event as Emploi).end)}
                        localizer={localizer}
                        events={events}
                        style={{ height: 600 }}
                        onDoubleClickEvent={handleDoubleClickEvent}
                        defaultView="week"
                        views={['week']}
                        date={currentDate}
                        defaultDate={currentDate}
                        onNavigate={(date) => setCurrentDate(date)}
                        step={90}
                        timeslots={1}
                        min={new Date(1970, 1, 1, 8, 0)}
                        max={new Date(1970, 1, 1, 17, 0)}
                        onEventDrop={onEventDrop}
                        resizable
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


