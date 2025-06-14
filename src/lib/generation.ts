
/*import { supabase } from '@/src/lib/supabaseClient'


export type Session = {
    cours_id: string
    salle_id: string
    date: string
    heure_debut: string
    heure_fin: string
    type: 'Cours' | 'TD' | 'TP'
}

export async function genererEmploiDuTemps(setMessage?: (msg: string) => void): Promise<Session[]> {
    if (setMessage) setMessage('Génération en cours...')

    const { data: cours } = await supabase.from('cours').select('*')
    const { data: salles } = await supabase.from('salles').select('*')

    const jours = ['2024-06-01', '2024-06-02', '2024-06-03']
    const creneaux = ['08:00', '10:00', '14:00', '16:00']

    const emplois: Session[] = []

    const estValide = (salleId: string, date: string, heure: string) => {
        return !emplois.some(e =>
            e.salle_id === salleId &&
            e.date === date &&
            e.heure_debut === heure
        )
    }

    const backtrack = (index: number): boolean => {
        if (!cours || !salles) return false
        if (index === cours.length) return true

        const coursActuel = cours[index]

        for (let jour of jours) {
            for (let heure of creneaux) {
                for (let salle of salles) {
                    if (estValide(salle.id, jour, heure)) {
                        emplois.push({
                            cours_id: coursActuel.id,
                            salle_id: salle.id,
                            date: jour,
                            type: 'Cours',
                            heure_debut: heure,
                            heure_fin:
                                heure === '08:00' ? '10:00' :
                                    heure === '10:00' ? '12:00' :
                                        heure === '14:00' ? '16:00' : '18:00'
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

    // Si on veut que l’appelant insère lui-même dans Supabase :
    return emplois
}
*/