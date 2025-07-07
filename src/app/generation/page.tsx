'use client'
import { supabase } from '@/src/lib/supabaseClient'
import { useState, useEffect } from 'react'
import { genererEmploiDuTemps, diagnostiquerDonneesSimple, verifierCohérence, testerAlgorithmeAvance } from '@/src/lib/generation'
import Header from '@/src/components/Header'
import AuthGuard from '@/src/components/AuthGuard'
import { FaCogs } from 'react-icons/fa'

interface Filiere { id: string; nom: string }
interface Section { id: string; nom: string }
interface Groupe { id: string; nom: string }

export default function GenerationPage() {
    const [loading, setLoading] = useState(false)
    const [message, setMessage] = useState('')
    const [diagnostic, setDiagnostic] = useState('')
    
    // États pour la hiérarchie de sélection
    const [filieres, setFilieres] = useState<Filiere[]>([])
    const [promotions, setPromotions] = useState<string[]>([])
    const [sections, setSections] = useState<Section[]>([])
    const [groupes, setGroupes] = useState<Groupe[]>([])
    
    // États pour les sélections
    const [selectedFiliere, setSelectedFiliere] = useState('')
    const [selectedPromotion, setSelectedPromotion] = useState('')
    const [selectedSection, setSelectedSection] = useState('')
    const [selectedGroupe, setSelectedGroupe] = useState('')

    // Charger les filières
    useEffect(() => {
        async function loadFilieres() {
            setLoading(true)
            const { data, error } = await supabase.from('filieres').select('id, nom').order('nom')
            if (error) console.error('Error loading filieres:', error)
            else setFilieres(data || [])
            setLoading(false)
        }
        loadFilieres()
    }, [])

    // Charger les promotions quand la filière change
    useEffect(() => {
        if (!selectedFiliere) {
            setPromotions([]); return;
        }
        async function loadPromotions() {
            setLoading(true)
            const { data: sectionsInFiliere, error: sectionsError } = await supabase
                .from('sections')
                .select('id')
                .eq('filiere_id', selectedFiliere)

            if (sectionsError || !sectionsInFiliere || sectionsInFiliere.length === 0) {
                setPromotions([]); setLoading(false); return;
            }

            const sectionIds = sectionsInFiliere.map(s => s.id)
            
            const { data, error } = await supabase
                .from('groupes')
                .select('niveau')
                .in('section_id', sectionIds)
                .not('niveau', 'is', null)

            if (error) setPromotions([])
            else {
                const promotionsUniques = [...new Set(data.map(g => g.niveau).filter(Boolean) as string[])]
                setPromotions(promotionsUniques.sort())
            }
            setLoading(false)
        }
        loadPromotions()
    }, [selectedFiliere])

    // Charger les sections quand la promotion change
    useEffect(() => {
        if (!selectedFiliere || !selectedPromotion) {
            setSections([]); return;
        }
        async function loadSections() {
            setLoading(true)
            const { data: sectionsInFiliere, error: sectionsError } = await supabase
                .from('sections')
                .select('id')
                .eq('filiere_id', selectedFiliere)

            if (sectionsError || !sectionsInFiliere || sectionsInFiliere.length === 0) {
                setSections([]); setLoading(false); return;
            }

            const sectionIdsInFiliere = sectionsInFiliere.map(s => s.id)

            const { data: groupesWithNiveau, error: groupesError } = await supabase
                .from('groupes')
                .select('section_id')
                .in('section_id', sectionIdsInFiliere)
                .eq('niveau', selectedPromotion)

            if (groupesError || !groupesWithNiveau || groupesWithNiveau.length === 0) {
                setSections([]); setLoading(false); return;
            }
            
            const relevantSectionIds = [...new Set(groupesWithNiveau.map(g => g.section_id).filter(Boolean))]

            if(relevantSectionIds.length > 0) {
                const { data: finalSections, error: finalSectionsError } = await supabase
                    .from('sections')
                    .select('id, nom')
                    .in('id', relevantSectionIds)
                    .order('nom')

                if (finalSectionsError) setSections([])
                else setSections(finalSections || [])
            } else {
                setSections([])
            }
            setLoading(false)
        }
        loadSections()
    }, [selectedFiliere, selectedPromotion])

    // Charger les groupes quand la section change
    useEffect(() => {
        if (!selectedSection || !selectedPromotion) {
            setGroupes([]); return;
        }
        async function loadGroupes() {
            setLoading(true)
            const { data, error } = await supabase
                .from('groupes')
                .select('id, nom')
                .eq('section_id', selectedSection)
                .eq('niveau', selectedPromotion)
                .order('nom')
            
            if (error) setGroupes([])
            else setGroupes(data || [])
            setLoading(false)
        }
        loadGroupes()
    }, [selectedSection, selectedPromotion])

    const lancerGeneration = async () => {
        if (!selectedSection) {
            setMessage('Veuillez sélectionner une section.')
            return
        }

        setLoading(true)
        setMessage('')
        setDiagnostic('')
        
        const success = await genererEmploiDuTemps(selectedSection, setMessage, selectedPromotion)
        
        if (success) {
            setMessage('Génération terminée avec succès !')
        }

        setLoading(false)
    }

    const lancerDiagnostic = async () => {
        if (!selectedSection) {
            setMessage('Veuillez sélectionner une section.')
            return
        }

        setLoading(true)
        setMessage('')
        setDiagnostic('')
        
        try {
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Timeout: La requête a pris trop de temps')), 10000)
            );
            const diagnosticPromise = diagnostiquerDonneesSimple(selectedSection);
            const rapport = await Promise.race([diagnosticPromise, timeoutPromise]) as string;
            setDiagnostic(rapport);
        } catch (error) {
            setDiagnostic(`❌ Erreur lors du diagnostic: ${error}\n\nEssayez de rafraîchir la page ou vérifiez votre connexion.`);
        }
        setLoading(false)
    }

    const verifierCohérenceLocale = async () => {
        setLoading(true)
        setMessage('')
        setDiagnostic('')
        try {
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Timeout: La requête a pris trop de temps')), 10000)
            );
            const cohérencePromise = verifierCohérence();
            const rapport = await Promise.race([cohérencePromise, timeoutPromise]) as string;
            setDiagnostic(rapport);
        } catch (error) {
            setDiagnostic(`❌ Erreur lors de la vérification: ${error}\n\nEssayez de rafraîchir la page ou vérifiez votre connexion.`);
        }
        setLoading(false)
    }

    const testerAlgorithmeLocale = async () => {
        if (!selectedSection) {
            setMessage('Veuillez sélectionner une section d\'abord.');
            return;
        }

        setLoading(true)
        setMessage('🧪 Test de l\'algorithme avancé en cours...')
        setDiagnostic('')
        
        try {
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Timeout: Le test a pris trop de temps')), 30000)
            );
            
            const testPromise = testerAlgorithmeAvance(selectedSection, setMessage, selectedPromotion);
            const resultat = await Promise.race([testPromise, timeoutPromise]) as any;
            
            if (resultat.success) {
                setDiagnostic(resultat.details);
                setMessage(`✅ Test réussi ! ${resultat.planning.length} séances placées.`);
            } else {
                setDiagnostic(`❌ Test échoué: ${resultat.details}`);
                setMessage('❌ Le test de l\'algorithme a échoué.');
            }
        } catch (error) {
            setDiagnostic(`❌ Erreur lors du test: ${error}\n\nEssayez de rafraîchir la page ou vérifiez votre connexion.`);
            setMessage('❌ Erreur lors du test de l\'algorithme.');
        }
        setLoading(false)
    }

    return (
        <AuthGuard>
            <div className="min-h-screen bg-gradient-to-br from-gray-50 to-indigo-100 p-4 sm:p-6 lg:p-8">
                <div className="max-w-7xl mx-auto">
                    <Header />
                    <h1 className="text-2xl font-bold mb-4 text-center">Génération automatique</h1>
                    <div className="bg-white p-6 rounded-2xl shadow-xl mb-8 border border-indigo-100">
                        <h2 className="text-lg font-semibold mb-4 text-gray-800">Sélection hiérarchique</h2>
                        
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                            {/* Filière */}
                            <div>
                                <label htmlFor="filiere" className="block text-sm font-medium text-gray-700 mb-2">
                                    Filière :
                                </label>
                                <select
                                    id="filiere"
                                    value={selectedFiliere}
                                    onChange={(e) => {
                                        setSelectedFiliere(e.target.value)
                                        setSelectedPromotion('')
                                        setSelectedSection('')
                                        setSelectedGroupe('')
                                    }}
                                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                    disabled={loading}
                                >
                                    <option value="">Sélectionner une filière</option>
                                    {filieres.map((filiere) => (
                                        <option key={filiere.id} value={filiere.id}>
                                            {filiere.nom}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Promotion */}
                            <div>
                                <label htmlFor="promotion" className="block text-sm font-medium text-gray-700 mb-2">
                                    Promotion (Niveau) :
                                </label>
                                <select
                                    id="promotion"
                                    value={selectedPromotion}
                                    onChange={(e) => {
                                        setSelectedPromotion(e.target.value)
                                        setSelectedSection('')
                                        setSelectedGroupe('')
                                    }}
                                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                    disabled={loading || !selectedFiliere}
                                >
                                    <option value="">Sélectionner une promotion</option>
                                    {promotions.map((promotion) => (
                                        <option key={promotion} value={promotion}>
                                            {promotion}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Section */}
                            <div>
                                <label htmlFor="section" className="block text-sm font-medium text-gray-700 mb-2">
                                    Section :
                                </label>
                                <select
                                    id="section"
                                    value={selectedSection}
                                    onChange={(e) => {
                                        setSelectedSection(e.target.value)
                                        setSelectedGroupe('')
                                    }}
                                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                    disabled={loading || !selectedPromotion}
                                >
                                    <option value="">Sélectionner une section</option>
                                    {sections.map((section) => (
                                        <option key={section.id} value={section.id}>
                                            {section.nom}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Groupe */}
                            <div>
                                <label htmlFor="groupe" className="block text-sm font-medium text-gray-700 mb-2">
                                    Groupe :
                                </label>
                                <select
                                    id="groupe"
                                    value={selectedGroupe}
                                    onChange={(e) => setSelectedGroupe(e.target.value)}
                                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                    disabled={loading || !selectedSection}
                                >
                                    <option value="">Sélectionner un groupe</option>
                                    {groupes.map((groupe) => (
                                        <option key={groupe.id} value={groupe.id}>
                                            {groupe.nom}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {selectedSection && (
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
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

                            </div>
                        )}

                        <div className="flex gap-4 mb-4 flex-wrap">
                            <button
                                onClick={verifierCohérenceLocale}
                                disabled={loading}
                                className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                <FaCogs className="text-lg" />
                                Vérifier la cohérence
                            </button>
                            <button
                                onClick={testerAlgorithmeLocale}
                                disabled={loading || !selectedSection}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                <FaCogs className="text-lg" />
                                🧪 Tester l'algorithme avancé
                            </button>
                            <button
                                onClick={lancerDiagnostic}
                                className="bg-yellow-600 text-white px-6 py-2 rounded hover:bg-yellow-700 disabled:opacity-50"
                                disabled={loading || !selectedSection}
                            >
                                {loading ? 'Diagnostic...' : 'Diagnostiquer'}
                            </button>
                            <button
                                onClick={lancerGeneration}
                                className="bg-green-600 text-white px-6 py-2 rounded hover:bg-green-700 disabled:opacity-50"
                                disabled={loading || !selectedSection}
                            >
                                {loading ? 'Génération...' : 'Générer automatiquement'}
                            </button>
                        </div>
                        {message && (
                            <div className="mb-4 p-3 rounded-md text-sm">
                                {message.includes('Erreur') || message.includes('échec') ? (
                                    <div className="text-red-700 bg-red-100 border border-red-300 p-3 rounded-md">
                                        {message}
                                    </div>
                                ) : (
                                    <div className="text-green-700 bg-green-100 border border-green-300 p-3 rounded-md">
                                        {message}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                    
                    {diagnostic && (
                        <div className="bg-white p-6 rounded-2xl shadow-xl border border-indigo-100">
                            <h2 className="text-xl font-bold mb-4">Résultat du diagnostic / test</h2>
                            <pre className="whitespace-pre-wrap text-sm bg-gray-50 p-4 rounded-lg overflow-auto max-h-96">
                                {diagnostic}
                            </pre>
                        </div>
                    )}
                </div>
            </div>
        </AuthGuard>
    )
}