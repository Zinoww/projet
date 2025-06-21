import { supabase } from '@/src/lib/supabaseClient'


export type Session = {
    cours_id: string
    salle_id: string
    enseignant_id: string | null
    date: string
    heure_debut: string
    heure_fin: string
    type: 'Cours' | 'TD' | 'TP'
}

function shuffle(array: any[]) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

export async function genererEmploiDuTemps(setMessage?: (msg: string) => void): Promise<Session[]> {
    if (setMessage) setMessage('Génération en cours...')

    const { data: rawCours } = await supabase.from('cours').select('*, enseignant_id')
    const { data: salles } = await supabase.from('salles').select('*')

    if (!rawCours || !salles) {
        if (setMessage) setMessage("Erreur: Impossible de charger les cours ou les salles.")
        return []
    }
    
    const cours = shuffle([...rawCours]);

    // Générer les dates de la semaine actuelle (lundi à vendredi)
    const today = new Date();
    const monday = new Date(today);
    monday.setDate(today.getDate() - today.getDay() + 1); // Lundi de cette semaine
    
    const jours: string[] = [];
    for (let i = 0; i < 5; i++) {
        const date = new Date(monday);
        date.setDate(monday.getDate() + i);
        jours.push(date.toISOString().split('T')[0]); // Format YYYY-MM-DD
    }

    const creneaux = ['08:00', '09:30', '11:00', '13:30', '15:00']

    const emplois: Session[] = []

    const estValide = (salleId: string, enseignantId: string | null, date: string, heure: string) => {
        // Vérifie si la salle est occupée
        const salleOccupee = emplois.some(e =>
            e.salle_id === salleId &&
            e.date === date &&
            e.heure_debut === heure
        );
        if (salleOccupee) return false;

        // Vérifie si l'enseignant est déjà occupé
        if (enseignantId) {
            const enseignantOccupe = emplois.some(e => {
                const coursSession = cours?.find(c => c.id === e.cours_id);
                return coursSession?.enseignant_id === enseignantId &&
                       e.date === date &&
                       e.heure_debut === heure;
            });
            if (enseignantOccupe) return false;
        }

        return true;
    }

    const backtrack = (index: number): boolean => {
        if (!cours || !salles) return false
        if (index === cours.length) return true

        const coursActuel = cours[index]

        for (let jour of shuffle([...jours])) {
            for (let heure of shuffle([...creneaux])) {
                for (let salle of shuffle([...salles])) {
                    if (estValide(salle.id, coursActuel.enseignant_id, jour, heure)) {
                        emplois.push({
                            cours_id: coursActuel.id,
                            salle_id: salle.id,
                            enseignant_id: coursActuel.enseignant_id,
                            date: jour,
                            type: coursActuel.type,
                            heure_debut: heure,
                            heure_fin:
                                heure === '08:00' ? '09:30' :
                                    heure === '09:30' ? '11:00' :
                                        heure === '11:00' ? '12:30' :
                                            heure === '13:30' ? '15:00' : '16:30'
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

    if (!success) {
        if (setMessage) setMessage('Impossible de générer un planning valide.')
        return []
    }

    // Si on veut que l'appelant insère lui-même dans Supabase :
    return emplois
}