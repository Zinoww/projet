import { supabase } from '@/src/lib/supabaseClient'

// --- 1. TYPE DEFINITIONS ---

interface Seance {
    id: string;
    duree_minutes: number;
    cours_id: string;
    type_id: string;
    groupe_id: string;
    enseignant_id: string | null;
    // Relations
    enseignants: { id: string, nom: string, disponibilites: any }[] | null;
    groupes: { id: string, nom: string, section_id: string }[];
}

interface Salle {
    id: string;
    nom: string;
    capacite: number | null;
}

interface Creneau {
    debut: string; // "HH:mm:ss"
    fin: string;
}

interface EmploiDuTempsItem {
    seance_id: string;
    jour: string;
    heure_debut: string;
    heure_fin: string;
    salle_id: string;
}

// --- 2. HELPER FUNCTIONS ---

function shuffle<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// Ajout d'une fonction utilitaire pour vérifier la présence d'une entité
function assertDefined<T>(value: T | undefined | null, message: string): T {
  if (value === undefined || value === null) {
    throw new Error(message);
  }
  return value;
}

// --- 3. CORE GENERATION LOGIC ---

export async function genererEmploiDuTemps(
    sectionId: string, 
    setMessage: (msg: string) => void
): Promise<boolean> {
    
    // --- Étape 1: Récupération des données ---
    setMessage('1/5 - Récupération des données...');

    // a. Récupérer toutes les séances pour les groupes de la section spécifiée
    const { data: seances, error: seancesError } = await supabase
        .from('seances')
        .select(`
            id, duree_minutes, cours_id, type_id, groupe_id, enseignant_id,
            enseignants (id, nom, disponibilites),
            groupes!inner (id, nom, section_id)
        `)
        .eq('groupes.section_id', sectionId);

    if (seancesError || !seances || seances.length === 0) {
        setMessage(`Erreur ou aucune séance à planifier pour cette section. ${seancesError?.message || ''}`);
        return false;
    }

    // b. Récupérer toutes les salles
    const { data: salles, error: sallesError } = await supabase.from('salles').select('id, nom, capacite');
    if (sallesError || !salles || salles.length === 0) {
        setMessage(`Erreur ou aucune salle disponible. ${sallesError?.message || ''}`);
        return false;
    }

    // --- Étape 2: Initialisation ---
    setMessage('2/5 - Initialisation du planning...');
    const jours = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi'];
    const creneaux: Creneau[] = [
        { debut: '08:00:00', fin: '09:30:00' },
        { debut: '09:30:00', fin: '11:00:00' },
        { debut: '11:00:00', fin: '12:30:00' },
        { debut: '13:30:00', fin: '15:00:00' },
        { debut: '15:00:00', fin: '16:30:00' }
    ];

    const planning: EmploiDuTempsItem[] = [];
    const seancesAPlacer = shuffle(seances as Seance[]);

    // --- Fonction de validation ---
    const estValide = (seance: Seance, jour: string, creneau: Creneau, salle: Salle): boolean => {
        // Contrainte 1: Le groupe de la séance est-il déjà occupé ?
        const groupeOccupe = planning.some(p => {
            const seancePlanifiee = seancesAPlacer.find(s => s.id === p.seance_id);
            return seancePlanifiee?.groupe_id === seance.groupe_id && p.jour === jour && p.heure_debut === creneau.debut;
        });
        if (groupeOccupe) return false;

        // Contrainte 2: L'enseignant est-il déjà occupé ?
        if (seance.enseignant_id) {
            const enseignantOccupe = planning.some(p => {
                const seancePlanifiee = seancesAPlacer.find(s => s.id === p.seance_id);
                return seancePlanifiee?.enseignant_id === seance.enseignant_id && p.jour === jour && p.heure_debut === creneau.debut;
            });
            if (enseignantOccupe) return false;
        }

        // Contrainte 3: La salle est-elle déjà occupée ?
        const salleOccupee = planning.some(p => p.salle_id === salle.id && p.jour === jour && p.heure_debut === creneau.debut);
        if (salleOccupee) return false;
        
        // TODO: Ajouter la vérification des disponibilités JSON de l'enseignant
        // TODO: Ajouter la vérification de la capacité de la salle

        return true;
    }

    // --- Étape 3: Algorithme de Backtracking ---
    setMessage('3/5 - Recherche d\'une solution...');
    const solve = (seanceIndex: number): boolean => {
        if (seanceIndex >= seancesAPlacer.length) {
            return true; // Toutes les séances sont placées
        }

        const seanceActuelle = seancesAPlacer[seanceIndex];

        for (const jour of shuffle(jours)) {
            for (const creneau of shuffle(creneaux)) {
                for (const salle of shuffle(salles)) {
                    if (estValide(seanceActuelle, jour, creneau, salle)) {
                        planning.push({
                            seance_id: seanceActuelle.id,
                            jour: jour,
                            heure_debut: creneau.debut,
                            heure_fin: creneau.fin,
                            salle_id: salle.id
                        });

                        if (solve(seanceIndex + 1)) {
                            return true; // Solution trouvée
                        }

                        planning.pop(); // Backtrack
                    }
                }
            }
        }

        return false; // Aucune solution trouvée pour cette branche
    }

    const success = solve(0);

    if (!success) {
        setMessage('Échec : Impossible de générer un emploi du temps avec les contraintes actuelles.');
        return false;
    }

    // --- Étape 4: Sauvegarde du résultat ---
    setMessage('4/5 - Sauvegarde du nouvel emploi du temps...');
    
    // a. Lister les ID des groupes de la section pour nettoyer l'ancien planning
    const groupeIds = [...new Set(seances.map(s => {
      const groupe = assertDefined(s.groupes?.[0], `Séance ${s.id} sans groupe associé.`);
      return groupe.id;
    }))];

    // b. Récupérer les ID des anciennes séances pour ces groupes
    const { data: oldSeances, error: oldSeancesError } = await supabase
        .from('seances')
        .select('id')
        .in('groupe_id', groupeIds);

    if (oldSeancesError) {
        setMessage(`Erreur lors de la récupération des anciennes séances: ${oldSeancesError.message}`);
        return false;
    }

    // c. Supprimer les anciennes entrées de l'emploi du temps
    const oldSeanceIds = oldSeances.map(s => s.id);
    if (oldSeanceIds.length > 0) {
        const { error: deleteError } = await supabase
            .from('emplois_du_temps')
            .delete()
            .in('seance_id', oldSeanceIds);

        if (deleteError) {
            setMessage(`Erreur lors du nettoyage de l'ancien planning: ${deleteError.message}`);
            return false;
        }
    }

    // d. Insérer le nouveau planning
    const { error: insertError } = await supabase.from('emplois_du_temps').insert(planning);
    if (insertError) {
        setMessage(`Erreur lors de la sauvegarde du nouveau planning: ${insertError.message}`);
        return false;
    }

    setMessage('5/5 - Génération terminée avec succès !');
    return true;
}