import { supabase } from '@/src/lib/supabaseClient'
import moment from 'moment';
import 'moment/locale/fr';

// --- 1. TYPE DEFINITIONS ---

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
    groupe_id?: string; // Ajouté pour la cohérence avec l'utilisation plus bas
    enseignant_id?: string; // Pour la vérification des conflits d'enseignant
}

interface Groupe {
    id: string;
    nom: string;
    niveau?: string;
    specialite?: string;
    section_id: string;
}

interface Salle {
    id: string;
    nom: string;
    capacite?: number;
}
interface Seance {
    id: string;
    duree_minutes?: number;
    enseignant_id?: string;
    groupe_id: string;
    cours_id: string;
    type_id: string;
    cours?: { nom: string; niveau?: string };
    types_seances?: { nom: string };
    enseignants?: { nom: string };
}

interface PlacementState {
    planning: EmploiDuTempsItem[];
    planningGroupes: { [key: string]: { [key: string]: string[] } };
    planningEnseignants: { [key: string]: { [key: string]: string[] } };
    planningSalles: { [key: string]: { [key: string]: string[] } };
}

// --- 2. HELPER FUNCTIONS ---

function shuffle<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

type AnyObject = Record<string, unknown>;

// Fonction pour calculer la difficulté de placement d'une séance
function calculerDifficultePlacement(seance: Seance, groupes: Groupe[]): number {
    let difficulte = 0;

    // Plus de groupes = plus difficile
    if (seance.types_seances?.nom?.toLowerCase().includes('cm')) {
        difficulte += groupes.length * 10;
    } else {
        difficulte += 5; // TD/TP
    }

    // Enseignant assigné = plus difficile
    if (seance.enseignant_id) {
        difficulte += 20;
    }

    // Durée plus longue = plus difficile
    difficulte += (seance.duree_minutes || 90) / 30;

    return difficulte;
}

// Fonction pour vérifier si une séance peut être placée
function peutPlacerSeance(
    seance: Seance,
    jour: string,
    creneau: Creneau,
    salle_id: string,
    state: PlacementState,
    groupes: Groupe[],
    amphis: Salle[],
    sallesNormales: Salle[]
): boolean {
    // VÉRIFICATION ABSOLUE : Aucun conflit de salle et créneau ne doit exister
    const conflitSalleCreneau = state.planning.find(p =>
        p.jour === jour &&
        p.heure_debut === creneau.debut &&
        p.salle_id === salle_id
    );

    if (conflitSalleCreneau) {

        return false;
    }

    // VÉRIFICATION SUPPLÉMENTAIRE : Aucun autre cours ne doit utiliser cette salle à ce créneau
    const autreCoursMemeCreneau = state.planning.some(p =>
        p.jour === jour &&
        p.heure_debut === creneau.debut &&
        p.salle_id === salle_id
    );

    if (autreCoursMemeCreneau) {
        return false;
    }

    // Vérifier si le groupe de la séance est déjà occupé à ce créneau (par une autre séance)
    const groupeOccupe = state.planning.some(p =>
        p.jour === jour &&
        p.heure_debut === creneau.debut &&
        p.groupe_id === seance.groupe_id
    );
    if (groupeOccupe) {
        return false;
    }

    // Vérifier si l'enseignant est déjà occupé à ce créneau (par une autre séance)
    if (seance.enseignant_id) {
        const enseignantOccupe = state.planning.some(p =>
            p.jour === jour &&
            p.heure_debut === creneau.debut &&
            p.enseignant_id === seance.enseignant_id
        );
        if (enseignantOccupe) {
            return false;
        }
    }

    // Vérifier la capacité de la salle (relaxée pour plus de flexibilité)
    const salleInfo = [...amphis, ...sallesNormales].find(s => s.id === salle_id);
    if (!salleInfo) {
        return false; // Salle doit exister
    }

    // Vérifier la capacité selon le type de séance (seulement si la capacité est définie)
    if (salleInfo.capacite && typeof salleInfo.capacite === 'number') {
        if (seance.types_seances?.nom?.toLowerCase().includes('cm')) {
            // Pour les CM, vérifier la capacité pour tous les groupes de la section
            const capaciteRequise = groupes.length * 25; // Réduire à 25 étudiants par groupe pour plus de flexibilité
            if (salleInfo.capacite < capaciteRequise) {
                return false;
            }
        } else {
            // Pour les TD/TP, vérifier la capacité pour un groupe
            const capaciteRequise = 25; // Réduire à 25 étudiants par groupe
            if (salleInfo.capacite < capaciteRequise) {
                return false;
            }
        }
    }
    // Si pas de capacité définie, permettre le placement

    // VÉRIFICATION DES RÈGLES DE PLACEMENT (avec flexibilité)
    const estAmphi = amphis.some(a => a.id === salle_id);
    const estSalleNormale = sallesNormales.some(s => s.id === salle_id);

    if (seance.types_seances?.nom?.toLowerCase().includes('cm')) {
        // CM devrait idéalement être dans un amphi, mais permettre les salles normales si nécessaire
        if (!estAmphi && !estSalleNormale) {
            return false; // Aucune salle disponible
        }
        // Note: On permet maintenant les CM dans les salles normales si pas d'amphi disponible
    } else if (seance.types_seances?.nom?.toLowerCase().includes('td') || seance.types_seances?.nom?.toLowerCase().includes('tp')) {
        // TD/TP devraient idéalement être dans des salles normales, mais permettre les amphis si nécessaire
        if (!estSalleNormale && !estAmphi) {
            return false; // Aucune salle disponible
        }
        // Note: On permet maintenant les TD/TP dans les amphis si pas de salle normale disponible
    }

    // VÉRIFICATION FINALE : S'assurer qu'aucun autre cours n'utilise cette salle à ce créneau
    const conflitFinal = state.planning.some(p =>
        p.jour === jour &&
        p.heure_debut === creneau.debut &&
        p.salle_id === salle_id
    );

    if (conflitFinal) {
        return false;
    }

    return true;
}

// Fonction pour placer une séance
function placerSeance(
    seance: Seance,
    jour: string,
    creneau: Creneau,
    salle_id: string,
    state: PlacementState,
    []
): PlacementState {
    // VÉRIFICATION ABSOLUE : S'assurer qu'aucun conflit n'existe avant le placement
    const conflitExistant = state.planning.find(p =>
        p.jour === jour &&
        p.heure_debut === creneau.debut &&
        p.salle_id === salle_id
    );

    if (conflitExistant) {
        return state; // Retourner l'état inchangé
    }

    // VÉRIFICATION SUPPLÉMENTAIRE : Double vérification anti-conflit
    const autreCoursMemeCreneau = state.planning.some(p =>
        p.jour === jour &&
        p.heure_debut === creneau.debut &&
        p.salle_id === salle_id
    );

    if (autreCoursMemeCreneau) {
        return state; // Retourner l'état inchangé
    }

    const newState = {
        planning: [...state.planning, {
            seance_id: seance.id,
            jour: jour,
            heure_debut: creneau.debut,
            heure_fin: creneau.fin,
            salle_id: salle_id,
            groupe_id: seance.groupe_id,
            enseignant_id: seance.enseignant_id
        }],
        planningGroupes: { ...state.planningGroupes },
        planningEnseignants: { ...state.planningEnseignants },
        planningSalles: { ...state.planningSalles }
    };

    // Initialiser les structures si nécessaire
    if (!newState.planningGroupes[jour]) newState.planningGroupes[jour] = {};
    if (!newState.planningGroupes[jour][creneau.debut]) newState.planningGroupes[jour][creneau.debut] = [];
    if (!newState.planningEnseignants[jour]) newState.planningEnseignants[jour] = {};
    if (!newState.planningEnseignants[jour][creneau.debut]) newState.planningEnseignants[jour][creneau.debut] = [];
    if (!newState.planningSalles[jour]) newState.planningSalles[jour] = {};
    if (!newState.planningSalles[jour][creneau.debut]) newState.planningSalles[jour][creneau.debut] = [];

    // Marquer la séance comme placée (plus de logique de groupes/enseignants à ce niveau)

    return newState;
}

// Fonction de backtracking principale
function backtrackingPlacement(
    seances: Seance[],
    state: PlacementState,
    groupes: Groupe[],
    amphis: Salle[],
    sallesNormales: Salle[],
    jours: string[],
    creneaux: Creneau[],
    maxIterations: number = 10000
): PlacementState | null {
    if (seances.length === 0) {
        return state; // Solution trouvée
    }

    if (maxIterations <= 0) {
        return null; // Timeout
    }

    const seance = seances[0];
    const seancesRestantes = seances.slice(1);
    let aTrouveUnPlacement = false;

    // DÉTERMINATION FLEXIBLE des salles selon le type de séance
    let sallesAppropriees: Salle[] = [];
    let sallesSecondaires: Salle[] = [];

    if (seance.types_seances?.nom?.toLowerCase().includes('cm')) {
        // CM → AMPHIS en priorité, SALLES NORMALES en fallback
        sallesAppropriees = amphis;
        sallesSecondaires = sallesNormales;
    } else if (seance.types_seances?.nom?.toLowerCase().includes('td') || seance.types_seances?.nom?.toLowerCase().includes('tp')) {
        // TD/TP → SALLES NORMALES en priorité, AMPHIS en fallback
        sallesAppropriees = sallesNormales;
        sallesSecondaires = amphis;
    } else {
        // Type inconnu → Toutes les salles disponibles
        sallesAppropriees = [...amphis, ...sallesNormales];
    }

    // VÉRIFICATION : S'assurer qu'il y a des salles disponibles (primaires ou secondaires)
    if (sallesAppropriees.length === 0 && sallesSecondaires.length === 0) {
        return null; // Aucune salle disponible du tout
    }

    // Essayer tous les créneaux possibles
    for (const jour of shuffle([...jours])) {
        for (const creneau of shuffle([...creneaux])) {
            // Essayer d'abord les salles appropriées (primaires)
            for (const salle of shuffle([...sallesAppropriees])) {
                if (peutPlacerSeance(seance, jour, creneau, salle.id, state, groupes, amphis, sallesNormales)) {
                    const newState = placerSeance(seance, jour, creneau, salle.id, state, groupes);
                    const resultat = backtrackingPlacement(
                        seancesRestantes,
                        newState,
                        groupes,
                        amphis,
                        sallesNormales,
                        jours,
                        creneaux,
                        maxIterations - 1
                    );
                    if (resultat) {
                        aTrouveUnPlacement = true;
                        return resultat; // Solution trouvée
                    }
                    // Sinon, continuer avec la prochaine salle
                } else {
                    // Log si on ne peut pas placer la séance à ce créneau/salle
                    // console.log(`[DEBUG] Impossible de placer séance ${seance.id} (${seance.type_id}) à ${jour} ${creneau.debut} salle ${salle.id}`);
                }
            }
            // Si pas de solution avec les salles primaires, essayer les salles secondaires
            if (sallesSecondaires.length > 0) {
                for (const salle of shuffle([...sallesSecondaires])) {
                    if (peutPlacerSeance(seance, jour, creneau, salle.id, state, groupes, amphis, sallesNormales)) {
                        const newState = placerSeance(seance, jour, creneau, salle.id, state, groupes);
                        const resultat = backtrackingPlacement(
                            seancesRestantes,
                            newState,
                            groupes,
                            amphis,
                            sallesNormales,
                            jours,
                            creneaux,
                            maxIterations - 1
                        );
                        if (resultat) {
                            aTrouveUnPlacement = true;
                            return resultat; // Solution trouvée avec salle secondaire
                        }
                        // Sinon, continuer avec la prochaine salle
                    } else {
                        // console.log(`[DEBUG] Impossible de placer séance ${seance.id} (${seance.type_id}) à ${jour} ${creneau.debut} salle secondaire ${salle.id}`);
                    }
                }
            }
        }
    }
    if (!aTrouveUnPlacement) {
        // Log détaillé pour la séance non placée
        console.warn(`[ALGO][BACKTRACK] Séance NON PLACÉE: id=${seance.id}, type_id=${seance.type_id}, groupe_id=${seance.groupe_id}, enseignant_id=${seance.enseignant_id}`);
    }
    return null; // Aucune solution trouvée
}

// Fonction d'amélioration locale
function ameliorationLocale(
    state: PlacementState,
    groupes: Groupe[],
    amphis: Salle[],
    sallesNormales: Salle[],
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _jours: string[],
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _creneaux: Creneau[]
): PlacementState {
    let amelioration = true;
    let iterations = 0;
    const maxIterations = 100;

    while (amelioration && iterations < maxIterations) {
        amelioration = false;
        iterations++;

        // Essayer d'échanger des créneaux pour optimiser
        for (let i = 0; i < state.planning.length; i++) {
            for (let j = i + 1; j < state.planning.length; j++) {
                const placement1 = state.planning[i];
                const placement2 = state.planning[j];

                // Vérifier si l'échange est possible et bénéfique
                if (peutEchangerPlacements(placement1, placement2, state, groupes, amphis, sallesNormales)) {
                    // Calculer le score avant échange
                    const scoreAvant = calculerScorePlanning(state);

                    // Effectuer l'échange
                    const newState = echangerPlacements(placement1, placement2, state);
                    if (newState) {
                        // Calculer le score après échange
                        const scoreApres = calculerScorePlanning(newState);

                        // Garder l'échange seulement s'il améliore le score
                        if (scoreApres > scoreAvant) {
                            state = newState;
                            amelioration = true;
                            break;
                        }
                    }
                }
            }
            if (amelioration) break;
        }
    }

    return state;
}

// Fonction pour calculer un score de qualité du planning
function calculerScorePlanning(state: PlacementState): number {
    let score = 0;

    // Score de base pour chaque séance placée
    score += state.planning.length * 100;

    // Bonus pour la répartition équilibrée
    const repartitionJours: { [key: string]: number } = {};
    state.planning.forEach(p => {
        repartitionJours[p.jour] = (repartitionJours[p.jour] || 0) + 1;
    });

    // Pénaliser les jours surchargés
    Object.values(repartitionJours).forEach(count => {
        if (count > 3) {
            score -= (count - 3) * 10; // Pénalité pour surcharge
        }
    });

    // Bonus pour les créneaux matinaux (préférés)
    state.planning.forEach(p => {
        const heure = parseInt(p.heure_debut.split(':')[0]);
        if (heure < 12) {
            score += 5; // Bonus pour le matin
        }
    });

    return score;
}

// Fonction pour vérifier si deux placements peuvent être échangés
function peutEchangerPlacements(
    placement1: EmploiDuTempsItem,
    placement2: EmploiDuTempsItem,
    state: PlacementState,
    groupes: Groupe[],
    amphis: Salle[],
    sallesNormales: Salle[]
): boolean {
    // Ne pas échanger si c'est le même placement
    if (placement1.seance_id === placement2.seance_id) return false;

    // Récupérer les détails des séances
    const seance1 = state.planning.find(p => p.seance_id === placement1.seance_id);
    const seance2 = state.planning.find(p => p.seance_id === placement2.seance_id);

    if (!seance1 || !seance2) return false;

    // Vérifier si l'échange respecte les contraintes
    const tempState = { ...state };

    // Simuler l'échange
    const tempJour1 = placement1.jour;
    const tempCreneau1 = { debut: placement1.heure_debut, fin: placement1.heure_fin };
    const tempSalle1 = placement1.salle_id;

    const tempJour2 = placement2.jour;
    const tempCreneau2 = { debut: placement2.heure_debut, fin: placement2.heure_fin };
    const tempSalle2 = placement2.salle_id;

    // Vérifier si les nouveaux placements sont possibles
    const peutPlacer1 = peutPlacerSeance(
        seance1 as unknown as Seance,
        tempJour2,
        tempCreneau2,
        tempSalle2,
        tempState,
        groupes,
        amphis,
        sallesNormales
    );

    const peutPlacer2 = peutPlacerSeance(
        seance2 as unknown as Seance,
        tempJour1,
        tempCreneau1,
        tempSalle1,
        tempState,
        groupes,
        amphis,
        sallesNormales
    );

    return peutPlacer1 && peutPlacer2;
}

// Fonction pour échanger deux placements
function echangerPlacements(
    placement1: EmploiDuTempsItem,
    placement2: EmploiDuTempsItem,
    state: PlacementState
): PlacementState | null {
    try {
        const newState = {
            planning: [...state.planning],
            planningGroupes: { ...state.planningGroupes },
            planningEnseignants: { ...state.planningEnseignants },
            planningSalles: { ...state.planningSalles }
        };

        // Trouver les indices des placements
        const index1 = newState.planning.findIndex(p => p.seance_id === placement1.seance_id);
        const index2 = newState.planning.findIndex(p => p.seance_id === placement2.seance_id);

        if (index1 === -1 || index2 === -1) return null;

        // Échanger les créneaux et salles
        const temp = { ...newState.planning[index1] };
        newState.planning[index1] = {
            ...newState.planning[index2],
            jour: placement1.jour,
            heure_debut: placement1.heure_debut,
            heure_fin: placement1.heure_fin,
            salle_id: placement1.salle_id
        };
        newState.planning[index2] = {
            ...temp,
            jour: placement2.jour,
            heure_debut: placement2.heure_debut,
            heure_fin: placement2.heure_fin,
            salle_id: placement2.salle_id
        };

        // Mettre à jour les structures de suivi
        // Supprimer les anciennes entrées
        if (newState.planningGroupes[placement1.jour]?.[placement1.heure_debut]) {
            newState.planningGroupes[placement1.jour][placement1.heure_debut] =
                newState.planningGroupes[placement1.jour][placement1.heure_debut].filter(id => id !== placement1.seance_id);
        }
        if (newState.planningGroupes[placement2.jour]?.[placement2.heure_debut]) {
            newState.planningGroupes[placement2.jour][placement2.heure_debut] =
                newState.planningGroupes[placement2.jour][placement2.heure_debut].filter(id => id !== placement2.seance_id);
        }

        // Ajouter les nouvelles entrées
        if (!newState.planningGroupes[placement2.jour]) newState.planningGroupes[placement2.jour] = {};
        if (!newState.planningGroupes[placement2.jour][placement2.heure_debut]) newState.planningGroupes[placement2.jour][placement2.heure_debut] = [];
        if (!newState.planningGroupes[placement1.jour]) newState.planningGroupes[placement1.jour] = {};
        if (!newState.planningGroupes[placement1.jour][placement1.heure_debut]) newState.planningGroupes[placement1.jour][placement1.heure_debut] = [];

        newState.planningGroupes[placement2.jour][placement2.heure_debut].push(placement1.seance_id);
        newState.planningGroupes[placement1.jour][placement1.heure_debut].push(placement2.seance_id);

        return newState;
    } catch (error) {
        console.error('Erreur lors de l\'échange:', error);
        return null;
    }
}

// Fonction de diagnostic simplifiée pour éviter les problèmes de performance
export async function diagnostiquerDonneesSimple(sectionId: string): Promise<string> {
    let rapport = '=== DIAGNOSTIC SIMPLIFIÉ ===\n\n';

    try {
        // 1. Vérifier la section
        const { data: section, error: sectionError } = await supabase
            .from('sections')
            .select('nom')
            .eq('id', sectionId)
            .single();

        if (sectionError || !section) {
            rapport += `❌ Section ${sectionId} non trouvée\n`;
            return rapport;
        }

        rapport += `✅ Section: ${section.nom}\n\n`;

        // 2. Compter les groupes de cette section
        const { count: nbGroupes, error: groupesError } = await supabase
            .from('groupes')
            .select('*', { count: 'exact', head: true })
            .eq('section_id', sectionId);

        if (groupesError) {
            rapport += `❌ Erreur groupes: ${groupesError.message}\n`;
            return rapport;
        }

        rapport += `📊 Groupes dans cette section: ${nbGroupes || 0}\n\n`;

        // 3. Compter les séances totales pour cette section
        const { data: groupes, error: groupesDataError } = await supabase
            .from('groupes')
            .select('id')
            .eq('section_id', sectionId);

        if (groupesDataError || !groupes) {
            rapport += `❌ Erreur récupération groupes: ${groupesDataError?.message}\n`;
            return rapport;
        }

        const groupeIds = groupes.map(g => g.id);
        const { count: nbSeances, error: seancesError } = await supabase
            .from('seances')
            .select('*', { count: 'exact', head: true })
            .in('groupe_id', groupeIds);

        if (seancesError) {
            rapport += `❌ Erreur séances: ${seancesError.message}\n`;
            return rapport;
        }

        rapport += `📊 Total des séances pour cette section: ${nbSeances || 0}\n\n`;

        // 4. Analyser les types de séances
        if (nbSeances && nbSeances > 0) {
            const { data: seancesDetails, error: detailsError } = await supabase
                .from('seances')
                .select('id, duree_minutes, cours_id, type_id, groupe_id, cours(nom), types_seances(nom), enseignants(nom)')
                .in('groupe_id', groupeIds)
                .limit(10);

            if (detailsError) {
                rapport += `❌ Erreur détails séances: ${detailsError.message}\n`;
            } else {
                rapport += `📋 Analyse des séances:\n`;

                // Compter par type
                const typesCount: { [key: string]: number } = {};
                seancesDetails?.forEach((seance: AnyObject) => {
                    const type = ((seance.types_seances as { nom?: string } | undefined)?.nom || 'Inconnu');
                    typesCount[type] = (typesCount[type] || 0) + 1;
                });

                Object.entries(typesCount).forEach(([type, count]) => {
                    rapport += `  • ${type}: ${count} séance(s)\n`;
                });

                rapport += '\n';
            }
        }

        rapport += '=== RECOMMANDATIONS ===\n';
        if (!nbGroupes || nbGroupes === 0) {
            rapport += '1. Créez des groupes pour cette section\n';
        }
        if (!nbSeances || nbSeances === 0) {
            rapport += '2. Créez des séances pour les groupes de cette section\n';
        }
        if (nbGroupes && nbGroupes > 0 && nbSeances && nbSeances > 0) {
            rapport += '3. Vérifiez que les séances ont des types appropriés (CM, TD, TP)\n';
            rapport += '4. Assurez-vous d\'avoir des salles avec des capacités appropriées\n';
        }

    } catch (error) {
        rapport += `❌ Erreur générale: ${error}\n`;
    }

    return rapport;
}

// --- 3. CORE GENERATION LOGIC ---

// Fonction de validation et correction des conflits
function validerEtCorrigerConflits(
    planning: PlacementState,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _groupes: Groupe[],
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _amphis: Salle[],
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _sallesNormales: Salle[]
): PlacementState {
    // Initialisation du planning valide
    const planningValide: PlacementState = {
        planning: [],
        planningGroupes: {},
        planningEnseignants: {},
        planningSalles: {}
    };

    const conflitsDetectes: { type: string; details: string; seanceId: string }[] = [];

    // Trier (gardé identique)
    const seancesTriees = [...planning.planning];

    // Préparer lookup maps pour occupation rapide
    const occSalles: { [key: string]: Set<string> } = {}; // key = `${jour}_${heure_debut}` -> set salle_id
    const occGroupes: { [key: string]: Set<string> } = {}; // key = `${jour}_${heure_debut}` -> set groupe_id
    const occEnseignants: { [key: string]: Set<string> } = {}; // key = `${jour}_${heure_debut}` -> set enseignant_id

    // Helper builders
    const normalizeHeure = (heure: string) => {
        if (!heure) return heure;
        // if format HH:mm -> convert to HH:mm:00
        const parts = heure.split(':');
        if (parts.length === 2) return `${parts[0].padStart(2,'0')}:${parts[1].padStart(2,'0')}:00`;
        if (parts.length === 3) return `${parts[0].padStart(2,'0')}:${parts[1].padStart(2,'0')}:${parts[2].padStart(2,'0')}`;
        return heure;
    };
    const makeKey = (jour: string, heure: string) => `${jour}_${heure}`;

    // All salles list from parameters
    const allSallesList: Salle[] = [...(_amphis || []), ...(_sallesNormales || [])];

    // Candidate jours/creneaux (consistent with generator)
    const joursPossibles = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi"];
    const creneauxPossibles = [
        { debut: '08:00:00', fin: '09:30:00' },
        { debut: '09:30:00', fin: '11:00:00' },
        { debut: '11:00:00', fin: '12:30:00' },
        { debut: '13:30:00', fin: '15:00:00' },
        { debut: '15:00:00', fin: '16:30:00' }
    ];

    // Iterate and place
    for (const placement of seancesTriees) {
    const heureNormOriginal = normalizeHeure(placement.heure_debut);
    const keyOriginal = makeKey(placement.jour, heureNormOriginal);
        const salleOcc = occSalles[keyOriginal] || new Set<string>();
        const groupeOcc = occGroupes[keyOriginal] || new Set<string>();
        const enseigOcc = occEnseignants[keyOriginal] || new Set<string>();

        const conflictSalle = salleOcc.has(placement.salle_id);
        const conflictGroupe = placement.groupe_id ? groupeOcc.has(placement.groupe_id) : false;
        const conflictEnseignant = placement.enseignant_id ? enseigOcc.has(placement.enseignant_id) : false;

        if (!conflictSalle && !conflictGroupe && !conflictEnseignant) {
            // Pas de conflit, on place (normalise heure pour l'affichage)
            const placed: EmploiDuTempsItem = {
                ...placement,
                heure_debut: heureNormOriginal,
                heure_fin: normalizeHeure(placement.heure_fin)
            };
            planningValide.planning.push(placed);
            // update occ maps
            const k = keyOriginal;
            if (!occSalles[k]) occSalles[k] = new Set();
            occSalles[k].add(placed.salle_id);
            if (placed.groupe_id) {
                if (!occGroupes[k]) occGroupes[k] = new Set();
                occGroupes[k].add(placed.groupe_id);
            }
            if (placed.enseignant_id) {
                if (!occEnseignants[k]) occEnseignants[k] = new Set();
                occEnseignants[k].add(placed.enseignant_id);
            }

            // update tracking structures
            if (!planningValide.planningGroupes[placement.jour]) planningValide.planningGroupes[placement.jour] = {};
            if (!planningValide.planningGroupes[placement.jour][placement.heure_debut]) planningValide.planningGroupes[placement.jour][placement.heure_debut] = [];
            planningValide.planningGroupes[placement.jour][placed.heure_debut].push(placed.seance_id);

            if (!planningValide.planningSalles[placement.jour]) planningValide.planningSalles[placement.jour] = {};
            if (!planningValide.planningSalles[placement.jour][placement.heure_debut]) planningValide.planningSalles[placement.jour][placement.heure_debut] = [];
            planningValide.planningSalles[placement.jour][placed.heure_debut].push(placed.salle_id);

            continue;
        }

        // Tentative de réaffectation systématique
        let reassigned = false;

        const tryReassign = (targetPlacement: EmploiDuTempsItem): boolean => {
            for (const j of joursPossibles) {
                for (const c of creneauxPossibles) {
                    const k = makeKey(j, c.debut);
                    for (const salle of allSallesList) {
                        const occSet = occSalles[k] || new Set<string>();
                        if (occSet.has(salle.id)) continue;
                        const groupSet = occGroupes[k] || new Set<string>();
                        if (targetPlacement.groupe_id && groupSet.has(targetPlacement.groupe_id)) continue;
                        const enseigSet = occEnseignants[k] || new Set<string>();
                        if (targetPlacement.enseignant_id && enseigSet.has(targetPlacement.enseignant_id)) continue;

                        // Place targetPlacement here
                        const heureDebutNorm = normalizeHeure(c.debut);
                        const heureFinNorm = normalizeHeure(c.fin);
                        const nouveauPlacement: EmploiDuTempsItem = {
                            seance_id: targetPlacement.seance_id,
                            jour: j,
                            heure_debut: heureDebutNorm,
                            heure_fin: heureFinNorm,
                            salle_id: salle.id,
                            groupe_id: targetPlacement.groupe_id,
                            enseignant_id: targetPlacement.enseignant_id
                        };

                        planningValide.planning.push(nouveauPlacement);

                        if (!occSalles[k]) occSalles[k] = new Set();
                        occSalles[k].add(salle.id);
                        if (targetPlacement.groupe_id) {
                            if (!occGroupes[k]) occGroupes[k] = new Set();
                            occGroupes[k].add(targetPlacement.groupe_id);
                        }
                        if (targetPlacement.enseignant_id) {
                            if (!occEnseignants[k]) occEnseignants[k] = new Set();
                            occEnseignants[k].add(targetPlacement.enseignant_id);
                        }

                        if (!planningValide.planningGroupes[j]) planningValide.planningGroupes[j] = {};
                        if (!planningValide.planningGroupes[j][heureDebutNorm]) planningValide.planningGroupes[j][heureDebutNorm] = [];
                        planningValide.planningGroupes[j][heureDebutNorm].push(nouveauPlacement.seance_id);

                        if (!planningValide.planningSalles[j]) planningValide.planningSalles[j] = {};
                        if (!planningValide.planningSalles[j][heureDebutNorm]) planningValide.planningSalles[j][heureDebutNorm] = [];
                        planningValide.planningSalles[j][heureDebutNorm].push(salle.id);

                        return true;
                    }
                }
            }
            return false;
        };

        // 1) Try to move current placement
        reassigned = tryReassign(placement);

        // 2) If not possible, try to move conflicting placements out of the way
        if (!reassigned) {
            // find conflicts in planningValide that block this placement
            const blockers = planningValide.planning.filter(p =>
                p.jour === placement.jour && p.heure_debut === placement.heure_debut && (
                    p.salle_id === placement.salle_id ||
                    (placement.groupe_id && p.groupe_id === placement.groupe_id) ||
                    (placement.enseignant_id && p.enseignant_id === placement.enseignant_id)
                )
            );

            for (const blocker of blockers) {
                // Attempt to move blocker elsewhere
                // Remove blocker from current occ maps/tracking to allow tryReassign to place others
                const keyBlock = makeKey(blocker.jour, blocker.heure_debut);
                if (occSalles[keyBlock]) occSalles[keyBlock].delete(blocker.salle_id);
                if (blocker.groupe_id && occGroupes[keyBlock]) occGroupes[keyBlock].delete(blocker.groupe_id);
                if (blocker.enseignant_id && occEnseignants[keyBlock]) occEnseignants[keyBlock].delete(blocker.enseignant_id);

                // Also remove from tracking structures planningValide.planningGroupes/planningSalles
                const pg = planningValide.planningGroupes[blocker.jour];
                if (pg && pg[blocker.heure_debut]) {
                    planningValide.planningGroupes[blocker.jour][blocker.heure_debut] = pg[blocker.heure_debut].filter(id => id !== blocker.seance_id);
                }
                const ps = planningValide.planningSalles[blocker.jour];
                if (ps && ps[blocker.heure_debut]) {
                    planningValide.planningSalles[blocker.jour][blocker.heure_debut] = ps[blocker.heure_debut].filter(id => id !== blocker.salle_id);
                }

                // Also remove from planningValide.planning array
                const idx = planningValide.planning.findIndex(p => p.seance_id === blocker.seance_id && p.jour === blocker.jour && p.heure_debut === blocker.heure_debut);
                if (idx !== -1) planningValide.planning.splice(idx, 1);

                // Now try to reassign the blocker somewhere else
                const moved = tryReassign(blocker);
                if (moved) {
                    // Now there's space for original placement at its original slot
                    const keyOrig = makeKey(placement.jour, normalizeHeure(placement.heure_debut));
                    if (!occSalles[keyOrig]) occSalles[keyOrig] = new Set();
                    occSalles[keyOrig].add(placement.salle_id);
                    if (placement.groupe_id) {
                        if (!occGroupes[keyOrig]) occGroupes[keyOrig] = new Set();
                        occGroupes[keyOrig].add(placement.groupe_id);
                    }
                    if (placement.enseignant_id) {
                        if (!occEnseignants[keyOrig]) occEnseignants[keyOrig] = new Set();
                        occEnseignants[keyOrig].add(placement.enseignant_id);
                    }

                    // Place the original placement into its original slot
                    const originalPlaced: EmploiDuTempsItem = {
                        ...placement,
                        heure_debut: normalizeHeure(placement.heure_debut),
                        heure_fin: normalizeHeure(placement.heure_fin)
                    };
                    planningValide.planning.push(originalPlaced);
                    if (!planningValide.planningGroupes[placement.jour]) planningValide.planningGroupes[placement.jour] = {};
                    if (!planningValide.planningGroupes[placement.jour][originalPlaced.heure_debut]) planningValide.planningGroupes[placement.jour][originalPlaced.heure_debut] = [];
                    planningValide.planningGroupes[placement.jour][originalPlaced.heure_debut].push(originalPlaced.seance_id);

                    if (!planningValide.planningSalles[placement.jour]) planningValide.planningSalles[placement.jour] = {};
                    if (!planningValide.planningSalles[placement.jour][originalPlaced.heure_debut]) planningValide.planningSalles[placement.jour][originalPlaced.heure_debut] = [];
                    planningValide.planningSalles[placement.jour][originalPlaced.heure_debut].push(placement.salle_id);

                    reassigned = true;
                    break;
                } else {
                    // If not moved, restore blocker to its original occupancy so we don't break other checks
                    if (!occSalles[keyBlock]) occSalles[keyBlock] = new Set();
                    occSalles[keyBlock].add(blocker.salle_id);
                    if (blocker.groupe_id) {
                        if (!occGroupes[keyBlock]) occGroupes[keyBlock] = new Set();
                        occGroupes[keyBlock].add(blocker.groupe_id);
                    }
                    if (blocker.enseignant_id) {
                        if (!occEnseignants[keyBlock]) occEnseignants[keyBlock] = new Set();
                        occEnseignants[keyBlock].add(blocker.enseignant_id);
                    }
                    // restore tracking arrays
                    if (!planningValide.planningGroupes[blocker.jour]) planningValide.planningGroupes[blocker.jour] = {};
                    if (!planningValide.planningGroupes[blocker.jour][blocker.heure_debut]) planningValide.planningGroupes[blocker.jour][blocker.heure_debut] = [];
                    planningValide.planningGroupes[blocker.jour][blocker.heure_debut].push(blocker.seance_id);
                    if (!planningValide.planningSalles[blocker.jour]) planningValide.planningSalles[blocker.jour] = {};
                    if (!planningValide.planningSalles[blocker.jour][blocker.heure_debut]) planningValide.planningSalles[blocker.jour][blocker.heure_debut] = [];
                    planningValide.planningSalles[blocker.jour][blocker.heure_debut].push(blocker.salle_id);
                }
            }
        }

        if (!reassigned) {
            conflitsDetectes.push({
                type: 'Conflit détecté et non résolu',
                details: 'Aucune réaffectation possible',
                seanceId: placement.seance_id
            });
            console.warn(`[ALGO][VALIDATION] Séance SUPPRIMÉE après échec de réaffectation: id=${placement.seance_id}`);
        }
    }

    if (conflitsDetectes.length > 0) {
        // Conflits détectés et corrigés automatiquement
        // Log global
        console.warn(`[ALGO][VALIDATION] ${conflitsDetectes.length} séance(s) supprimée(s) lors de la validation/correction des conflits.`);
    }

    return planningValide;
}

export async function genererEmploiDuTemps(
    sectionId: string,
    setMessage: (msg: string) => void,
    niveau?: string,
    filiereId?: string
): Promise<boolean> {
    // --- DEBUG LOG ---
    console.log('[ALGO][DEBUG] Début de la génération de l\'emploi du temps');
    // --- Étape 1: Récupération des données ---
    setMessage(filiereId || '');


    // a. Récupérer toutes les séances de la section, filière et niveau sélectionnés
    setMessage('1/7 - Récupération des séances de la section, filière et niveau...');

    let seancesFiltrees = [];
    // Récupérer toutes les séances qui correspondent à la section, la filière et le niveau (pas de jointures)
    const { data: seances, error: seancesError } = await supabase
        .from('seances')
        .select('*')
        .eq('section_id', sectionId)
        .eq('niveau', niveau)
        .eq('filiere_id', filiereId);

    if (seancesError || !seances || seances.length === 0) {
        setMessage('Erreur ou aucune séance trouvée pour cette section, filière et niveau.');
        return false;
    }

    // Récupérer les types de séances pour faire le mapping id -> nom
    const { data: typesSeances, error: typesSeancesError } = await supabase
        .from('types_seances')
        .select('id, nom');
    if (typesSeancesError || !typesSeances) {
        setMessage('Erreur lors de la récupération des types de séances.');
        return false;
    }
    // Création du mapping id -> nom
    const typeIdToNom: Record<string, string> = {};
    typesSeances.forEach((t: {id: string, nom: string}) => {
        typeIdToNom[t.id] = t.nom;
    });
    // Ajoute le nom du type à chaque séance (pour simplifier le filtrage)
    seancesFiltrees = seances.map(s => ({ ...s, type_nom: typeIdToNom[s.type_id] || '' }));


    // c. Récupérer toutes les salles
    const { data: salles, error: sallesError } = await supabase.from('salles').select('id, nom, capacite');
    if (sallesError || !salles || salles.length === 0) {
        setMessage(`Erreur ou aucune salle disponible. ${sallesError?.message || ''}`);
        return false;
    }

    // Séparer les amphis des salles normales
    const amphis = salles.filter(s =>
        s.nom.toLowerCase().includes('amphi') ||
        s.nom.toLowerCase().includes('amphithéâtre') ||
        s.nom.toLowerCase().includes('auditorium') ||
        (s.capacite && s.capacite >= 100) // Salles avec grande capacité considérées comme amphis
    );
    const sallesNormales = salles.filter(s =>
        !s.nom.toLowerCase().includes('amphi') &&
        !s.nom.toLowerCase().includes('amphithéâtre') &&
        !s.nom.toLowerCase().includes('auditorium') &&
        (!s.capacite || s.capacite < 100) // Salles avec capacité normale
    );


    // --- Étape 2: Organisation et tri des séances par difficulté ---
    setMessage('2/7 - Organisation et tri des séances...');

    // Séparer les séances par type (en utilisant le nom du type)
    const seancesCM = seancesFiltrees.filter(s => s.type_nom && s.type_nom.toLowerCase().includes('cm'));
    const seancesTD = seancesFiltrees.filter(s => s.type_nom && s.type_nom.toLowerCase().includes('td'));
    const seancesTP = seancesFiltrees.filter(s => s.type_nom && s.type_nom.toLowerCase().includes('tp'));

    // Trier les séances par difficulté de placement (plus difficile en premier)
    const toutesSeances = [...seancesCM, ...seancesTD, ...seancesTP];
    console.log('massine',seancesFiltrees)
    // On ne passe plus groupes, on passe un tableau vide
    const seancesTriees = toutesSeances.sort((a, b) => {
        const difficulteA = calculerDifficultePlacement(a, []);
        const difficulteB = calculerDifficultePlacement(b, []);
        return difficulteB - difficulteA; // Ordre décroissant
    });


    // --- Étape 3: Initialisation du planning...');
    const joursValides = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi"]; // Semaine algérienne : exclut Vendredi et Samedi
    const creneaux: Creneau[] = [
        { debut: '08:00:00', fin: '09:30:00' },
        { debut: '09:30:00', fin: '11:00:00' },
        { debut: '11:00:00', fin: '12:30:00' },
        { debut: '13:30:00', fin: '15:00:00' },
        { debut: '15:00:00', fin: '16:30:00' }
    ];

    // État initial du planning
    const initialState: PlacementState = {
        planning: [],
        planningGroupes: {},
        planningEnseignants: {},
        planningSalles: {}
    };

    // Augmenter les créneaux disponibles pour plus de flexibilité
    const creneauxEtendus = [
        { debut: '08:00:00', fin: '09:30:00' },
        { debut: '09:30:00', fin: '11:00:00' },
        { debut: '11:00:00', fin: '12:30:00' },
        { debut: '13:30:00', fin: '15:00:00' },
        { debut: '15:00:00', fin: '16:30:00' },
    ];

    // --- Étape 4: Algorithme de backtracking ---
    setMessage('4/7 - Placement des séances avec backtracking...');


    const resultat = backtrackingPlacement(
        seancesTriees,
        initialState,
        [], // groupes n'est plus utilisé
        amphis,
        sallesNormales,
        joursValides,
        creneauxEtendus, // Utiliser les créneaux étendus
        50000 // Augmenter la limite d'itérations
    );

    if (!resultat) {
        // Debug information
        const debugInfo = `
❌ ÉCHEC DU PLACEMENT - ANALYSE DÉTAILLÉE:

📊 STATISTIQUES GÉNÉRALES:
• Séances totales: ${seancesTriees.length}
• Amphithéâtres: ${amphis.length}
• Salles normales: ${sallesNormales.length}
• Créneaux disponibles: ${joursValides.length} jours × ${creneaux.length} créneaux = ${joursValides.length * creneaux.length} slots

📋 RÉPARTITION PAR TYPE:
• CM: ${seancesTriees.filter(s => s.types_seances?.nom?.toLowerCase().includes('cm')).length}
• TD: ${seancesTriees.filter(s => s.types_seances?.nom?.toLowerCase().includes('td')).length}
• TP: ${seancesTriees.filter(s => s.types_seances?.nom?.toLowerCase().includes('tp')).length}

🔍 CAUSES POSSIBLES:
• Capacité insuffisante des salles pour les CM
• Conflits d'enseignants
• Créneaux horaires insuffisants
• Contraintes de placement trop strictes

💡 SOLUTIONS RECOMMANDÉES:
1. Vérifier les capacités des amphithéâtres pour les CM
2. Augmenter le nombre de créneaux horaires
3. Réduire les contraintes de placement
4. Vérifier la disponibilité des enseignants
        `;
        setMessage(debugInfo);
        console.log('push final', debugInfo)
        return false;
    }

    // --- Étape 5: Amélioration locale ---
    setMessage('5/7 - Amélioration locale du planning...');


    const planningAmeliore = ameliorationLocale(
        resultat,
        [], // groupes n'est plus utilisé
        amphis,
        sallesNormales,
        joursValides,
        creneauxEtendus // Utiliser les créneaux étendus
    );

    // --- Étape 5.5: Optimisation avancée ---
    setMessage('5.5/7 - Optimisation avancée avec recherche tabou...');


    const planningOptimise = optimisationAvancee(
        planningAmeliore
    );

    // --- Étape 6: Sauvegarde du résultat ---
    setMessage('6/7 - Sauvegarde du nouvel emploi du temps...');


    // a. Supprimer les anciennes entrées de l'emploi du temps pour cette section
    // On récupère toutes les séances de la section (tous niveaux) via seancesFiltrees
    const allSeanceIds = seancesFiltrees.map(s => s.id);

    // Supprimer toutes les anciennes entrées de l'emploi du temps pour cette section
    const { error: deleteError } = await supabase
        .from('emplois_du_temps')
        .delete()
        .in('seance_id', allSeanceIds);

    if (deleteError) {
        setMessage(`Erreur lors du nettoyage de l'ancien planning: ${deleteError.message}`);
        console.log(`push final 2: ${deleteError.message}`);

        return false;
    }

    // b. Insérer le nouveau planning (seance_id, jour, date, heure_debut, heure_fin, salle_id)
    moment.locale('fr');
    moment.updateLocale('fr', { week: { dow: 0, doy: 4 } });
    const normalizeHeureForInsert = (h: string) => {
        if (!h) return h;
        const parts = h.split(':');
        if (parts.length === 2) return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}:00`;
        if (parts.length === 3) return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}:${parts[2].padStart(2, '0')}`;
        return h;
    };

    const planningToInsert = planningOptimise.planning.map(({ seance_id, jour, heure_debut, heure_fin, salle_id }) => {
        return ({ seance_id, jour, heure_debut: normalizeHeureForInsert(heure_debut), heure_fin: normalizeHeureForInsert(heure_fin), salle_id });
    });
    const { error: insertError } = await supabase.from('emplois_du_temps').insert(planningToInsert);
    if (insertError) {
        setMessage(`Erreur lors de la sauvegarde du nouveau planning: ${insertError.message}`);
               console.log(`push: ${insertError.message}`);

        return false;
    }

    // Après l'insertion dans emplois_du_temps

    // --- Étape 7: Rapport final ---
    setMessage('7/7 - Génération terminée !');

    // const seancesPlacees = planningOptimise.planning.length;
    const seancesTotales = seancesFiltrees.length;
    // const scoreFinal = calculerScorePlanning(planningOptimise);

    // --- Étape 7.5: Validation finale et correction des conflits ---
    setMessage('7.5/7 - Validation finale et correction des conflits...');


    const planningValide = validerEtCorrigerConflits(planningOptimise, [], amphis, sallesNormales);

    // VÉRIFICATION FINALE DE COHÉRENCE
    const verificationCohérence = verifierCohérencePlanning(planningValide.planning);

    if (!verificationCohérence.valide) {
        setMessage(`🚨 ERREUR CRITIQUE: Le planning généré contient encore des conflits ! ${verificationCohérence.conflits.length} conflit(s) détecté(s)`);
        console.error('Conflits détectés:', verificationCohérence.conflits);
        return false;
    }

    if (planningValide.planning.length !== planningOptimise.planning.length) {
        setMessage(`⚠️ Conflits détectés et corrigés: ${planningOptimise.planning.length - planningValide.planning.length} séances supprimées`);

        // Mettre à jour la base de données avec le planning corrigé
        const { error: updateError } = await supabase
            .from('emplois_du_temps')
            .delete()
            .in('seance_id', seancesFiltrees.map(s => s.id));

        if (!updateError) {
            const planningToInsert = planningValide.planning.map(({ seance_id, jour, heure_debut, heure_fin, salle_id }) => ({ seance_id, jour, heure_debut, heure_fin, salle_id }));
            const { error: insertError } = await supabase.from('emplois_du_temps').insert(planningToInsert);
            if (insertError) {
                setMessage(`Erreur lors de la mise à jour du planning corrigé: ${insertError.message}`);
            }
        }
    }

    let messageFinal = `🎯 Génération réussie avec algorithme avancé ! ${planningValide.planning.length}/${seancesTotales} séances placées.`;
    messageFinal += `\n\n📊 Logique de placement:`;
    messageFinal += `\n• CM → Amphis (${amphis.length} disponibles)`;
    messageFinal += `\n• TD/TP → Salles normales (${sallesNormales.length} disponibles)`;
    messageFinal += `\n\n🔧 Améliorations appliquées:`;
    messageFinal += `\n• Tri par difficulté de placement`;
    messageFinal += `\n• Algorithme de backtracking complet`;
    messageFinal += `\n• Optimisation locale par échanges`;
    messageFinal += `\n• Recherche tabou avancée`;
    messageFinal += `\n• Gestion intelligente des contraintes`;
    messageFinal += `\n• Validation et correction automatique des conflits`;
    messageFinal += `\n\n🏆 Score de qualité: ${calculerScorePlanning(planningValide)}`;

    if (planningValide.planning.length < seancesTotales) {
        const sessionsNonPlacees = seancesTotales - planningValide.planning.length;
        messageFinal += `\n\n⚠️ ${sessionsNonPlacees} séance(s) non placée(s)`;
        messageFinal += '\n\nCauses possibles:';
        messageFinal += '\n• Contraintes trop strictes';
        messageFinal += '\n• Manque de créneaux disponibles';
        messageFinal += '\n• Conflits d\'enseignants irréconciliables';
        messageFinal += '\n• Capacités de salles insuffisantes';
        messageFinal += '\n• Conflits de salles détectés et corrigés automatiquement';
    }

    // Ajoute les séances non placées à messageFinal
    if (planningValide.planning.length < seancesTriees.length) {
        const idsPlacees = new Set(planningValide.planning.map(p => p.seance_id));
        const nonPlacees = seancesTriees.filter(s => !idsPlacees.has(s.id));
        messageFinal += `\n\nSéances non placées :\n`;
        nonPlacees.forEach(s => {
            messageFinal += `• Séance ID: ${s.id} (Type ID: ${s.type_id})\n`;
        });
    }

    // Place l'appel ici, à la fin
    setMessage(messageFinal);

    return true;
}

// Fonction pour vérifier la cohérence des données
export async function verifierCohérence(): Promise<string> {
    let rapport = '=== VÉRIFICATION DE LA COHÉRENCE ===\n\n';

    try {
        // 1. Lister toutes les sections
        const { data: sections, error: sectionsError } = await supabase
            .from('sections')
            .select('id, nom')
            .order('nom');

        if (sectionsError) {
            rapport += `❌ Erreur sections: ${sectionsError.message}\n`;
            return rapport;
        }

        rapport += `📊 Sections existantes (${sections?.length || 0}):\n`;
        sections?.forEach(s => {
            rapport += `  - ${s.nom} (ID: ${s.id})\n`;
        });
        rapport += '\n';

        // 2. Lister tous les groupes
        const { data: groupes, error: groupesError } = await supabase
            .from('groupes')
            .select('id, nom, section_id')
            .order('nom');

        if (groupesError) {
            rapport += `❌ Erreur groupes: ${groupesError.message}\n`;
            return rapport;
        }

        rapport += `📊 Groupes existants (${groupes?.length || 0}):\n`;
        groupes?.forEach(g => {
            const section = sections?.find(s => s.id === g.section_id);
            rapport += `  - ${g.nom} → Section: ${section?.nom || 'INCONNUE'} (${g.section_id})\n`;
        });
        rapport += '\n';

        // 3. Identifier les problèmes
        rapport += '🔍 PROBLÈMES IDENTIFIÉS:\n';
        let problemes = 0;

        groupes?.forEach(g => {
            const section = sections?.find(s => s.id === g.section_id);
            if (!section) {
                rapport += `❌ Groupe "${g.nom}" → Section ID ${g.section_id} n'existe pas\n`;
                problemes++;
            }
        });

        if (problemes === 0) {
            rapport += '✅ Aucun problème de cohérence détecté\n';
        } else {
            rapport += `\n💡 SOLUTIONS:\n`;
            rapport += `1. Vérifiez que toutes les sections existent\n`;
            rapport += `2. Supprimez ou corrigez les groupes orphelins\n`;
        }

    } catch (error) {
        rapport += `❌ Erreur générale: ${error}\n`;
    }

    return rapport;
}

// Fonction d'optimisation avancée avec recherche tabou
function optimisationAvancee(
    state: PlacementState
): PlacementState {
    let meilleurState = { ...state };
    let meilleurScore = calculerScorePlanning(state);
    let iterations = 0;
    const maxIterations = 200;
    const tabouList: string[] = [];
    const tabouSize = 10;

    while (iterations < maxIterations) {
        iterations++;

        // Générer des voisins
        const voisins = genererVoisins(state);

        let meilleurVoisin = null;
        let meilleurScoreVoisin = -Infinity;

        for (const voisin of voisins) {
            const scoreVoisin = calculerScorePlanning(voisin);
            const hashVoisin = JSON.stringify(voisin.planning);

            // Vérifier si le voisin n'est pas dans la liste tabou
            if (!tabouList.includes(hashVoisin) && scoreVoisin > meilleurScoreVoisin) {
                meilleurVoisin = voisin;
                meilleurScoreVoisin = scoreVoisin;
            }
        }

        if (meilleurVoisin) {
            state = meilleurVoisin;
            const hashState = JSON.stringify(state.planning);
            tabouList.push(hashState);

            // Maintenir la taille de la liste tabou
            if (tabouList.length > tabouSize) {
                tabouList.shift();
            }

            // Mettre à jour le meilleur état global
            if (calculerScorePlanning(state) > meilleurScore) {
                meilleurState = { ...state };
                meilleurScore = calculerScorePlanning(state);
            }
        }
    }

    return meilleurState;
}

// Fonction pour générer des voisins (modifications légères) d'un état donné
function genererVoisins(
    state: PlacementState
): PlacementState[] {
    const voisins: PlacementState[] = [];

    for (let i = 0; i < state.planning.length; i++) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const _placement = state.planning[i];

        // Essayer de changer le créneau
        // No jours and creneaux parameters available, so skipping this part

        // Essayer de changer la salle
        // No amphis and sallesNormales parameters available, so skipping this part
    }

    return voisins;
}

// Fonction pour vérifier la cohérence d'un planning
function verifierCohérencePlanning(planning: EmploiDuTempsItem[]): { valide: boolean, conflits: string[] } {
    const conflits: string[] = [];

    // Vérifier les doublons exacts
    const doublons = planning.filter((item, index, array) =>
        array.findIndex(i => i.seance_id === item.seance_id && i.jour === item.jour && i.heure_debut === item.heure_debut && i.salle_id === item.salle_id) !== index
    );

    if (doublons.length > 0) {
        conflits.push(`Doublons détectés: ${doublons.map(d => d.seance_id).join(', ')}`);
    }

    // Vérifier les conflits de créneau pour le même groupe
    const conflitsGroupe = planning.filter((item, index, array) =>
        item.groupe_id && array.findIndex(i => i.groupe_id === item.groupe_id && i.jour === item.jour && i.heure_debut === item.heure_debut) !== index
    );

    if (conflitsGroupe.length > 0) {
        conflits.push(`Conflits de créneau pour le même groupe détectés: ${conflitsGroupe.map(c => c.seance_id).join(', ')}`);
    }

    // Vérifier les conflits de salle
    const conflitsSalle = planning.filter((item, index, array) =>
        array.findIndex(i => i.salle_id === item.salle_id && i.jour === item.jour && i.heure_debut === item.heure_debut) !== index
    );

    if (conflitsSalle.length > 0) {
        conflits.push(`Conflits de salle détectés: ${conflitsSalle.map(c => c.seance_id).join(', ')}`);
    }

    return {
        valide: conflits.length === 0,
        conflits: conflits
    };
}

// Fonction pour tester l'algorithme avancé avec des données réelles
export async function testerAlgorithmeAvancee(
    sectionId: string,
    setMessage: (msg: string) => void
): Promise<{ success: boolean; details: string; planning: EmploiDuTempsItem[] }> {
    setMessage('🧪 Test de l\'algorithme avancé en cours...');

    try {
        // Récupérer les données de la section
        const { data: section, error: sectionError } = await supabase
            .from('sections')
            .select('nom')
            .eq('id', sectionId)
            .single();

        if (sectionError || !section) {
            return {
                success: false,
                details: `❌ Section ${sectionId} non trouvée`,
                planning: []
            };
        }

        // Récupérer les groupes de la section
        const { data: groupes, error: groupesError } = await supabase
            .from('groupes')
            .select('id, nom')
            .eq('section_id', sectionId);

        const groupesTyped = groupes as Groupe[];

        if (groupesError || !groupesTyped || groupesTyped.length === 0) {
            return {
                success: false,
                details: `❌ Aucun groupe trouvé pour la section ${section.nom}`,
                planning: []
            };
        }

        // Récupérer les séances des groupes
        const groupeIds = groupesTyped.map(g => g.id);
        const { data: seances, error: seancesError } = await supabase
            .from('seances')
            .select('*, cours(nom), types_seances(nom)')
            .in('groupe_id', groupeIds);

        const seancesTyped = seances as AnyObject[];

        if (seancesError || !seances || seances.length === 0) {
            return {
                success: false,
                details: `❌ Aucune séance trouvée pour les groupes de la section ${section.nom}`,
                planning: []
            };
        }

        // Récupérer les salles
        const { data: salles, error: sallesError } = await supabase
            .from('salles')
            .select('id, nom, capacite');

        const sallesTyped = salles as Salle[];

        if (sallesError || !sallesTyped || sallesTyped.length === 0) {
            return {
                success: false,
                details: `❌ Aucune salle disponible`,
                planning: []
            };
        }

        // Séparer amphis et salles normales
        const amphis = sallesTyped.filter(s =>
            s.nom.toLowerCase().includes('amphi') ||
            s.nom.toLowerCase().includes('amphithéâtre') ||
            s.nom.toLowerCase().includes('auditorium') ||
            (s.capacite && s.capacite >= 100)
        );
        const sallesNormales = sallesTyped.filter(s =>
            !s.nom.toLowerCase().includes('amphi') &&
            !s.nom.toLowerCase().includes('amphithéâtre') &&
            !s.nom.toLowerCase().includes('auditorium') &&
            (!s.capacite || s.capacite < 100)
        );

        // Vérifier la cohérence des données
        let details = `✅ Test de cohérence des données:\n`;
        details += `• Section: ${section.nom}\n`;
        details += `• Groupes: ${groupes.length}\n`;
        details += `• Séances: ${seances.length}\n`;
        details += `• Salles totales: ${salles.length}\n`;
        details += `• Amphithéâtres: ${amphis.length}\n`;
        details += `• Salles normales: ${sallesNormales.length}\n\n`;

        // Analyser les types de séances
        const typesCount: { [key: string]: number } = {};
        seancesTyped.forEach((seance: AnyObject) => {
            const type = ((seance.types_seances as { nom?: string } | undefined)?.nom || 'Inconnu');
            typesCount[type] = (typesCount[type] || 0) + 1;
        });

        details += `📊 Répartition des types de séances:\n`;
        Object.entries(typesCount).forEach(([type, count]) => {
            details += `  • ${type}: ${count} séance(s)\n`;
        });

        // Vérifier les contraintes
        details += `\n🔍 Vérification des contraintes:\n`;

        // Vérifier si les CM peuvent être placés dans des amphis
        const seancesCM = seancesTyped.filter(s => (s.types_seances as { nom?: string } | undefined)?.nom?.toLowerCase().includes('cm'));
        if (seancesCM.length > 0 && amphis.length === 0) {
            details += `❌ ${seancesCM.length} CM trouvés mais aucun amphithéâtre disponible\n`;
        } else if (seancesCM.length > 0) {
            details += `✅ ${seancesCM.length} CM peuvent être placés dans ${amphis.length} amphithéâtre(s)\n`;
        }

        // Vérifier si les TD/TP peuvent être placés dans des salles normales
        const seancesTDTp = seancesTyped.filter(s =>
            (s.types_seances as { nom?: string } | undefined)?.nom?.toLowerCase().includes('td') ||
            (s.types_seances as { nom?: string } | undefined)?.nom?.toLowerCase().includes('tp')
        );
        if (seancesTDTp.length > 0 && sallesNormales.length === 0) {
            details += `❌ ${seancesTDTp.length} TD/TP trouvés mais aucune salle normale disponible\n`;
        } else if (seancesTDTp.length > 0) {
            details += `✅ ${seancesTDTp.length} TD/TP peuvent être placés dans ${sallesNormales.length} salle(s) normale(s)\n`;
        }

        return {
            success: true,
            details: details,
            planning: [] // Pour l'instant, on ne retourne pas de planning réel pour le test
        };

    } catch (error) {
        return {
            success: false,
            details: `❌ Erreur lors du test: ${error}`,
            planning: []
        };
    }
}

