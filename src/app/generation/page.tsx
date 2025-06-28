'use client'
import { supabase } from '@/src/lib/supabaseClient'
import { useState, useEffect } from 'react'
import { genererEmploiDuTemps, diagnostiquerDonneesSimple, verifierCohérence } from '@/src/lib/generation'
import Header from '@/src/components/Header'
import AuthGuard from '@/src/components/AuthGuard'

interface Section {
    id: string;
    nom: string;
}

export default function GenerationPage() {
    const [loading, setLoading] = useState(false)
    const [message, setMessage] = useState('')
    const [diagnostic, setDiagnostic] = useState('')
    
    // États pour la hiérarchie de sélection
    const [niveaux, setNiveaux] = useState<string[]>([])
    const [specialites, setSpecialites] = useState<string[]>([])
    const [sections, setSections] = useState<Section[]>([])
    
    // États pour les sélections
    const [selectedNiveau, setSelectedNiveau] = useState<string>('')
    const [selectedSpecialite, setSelectedSpecialite] = useState<string>('')
    const [selectedSection, setSelectedSection] = useState<string>('')

    // Charger les données initiales au montage du composant
    useEffect(() => {
        chargerDonneesInitiales()
    }, [])

    // Charger les niveaux disponibles
    useEffect(() => {
        if (selectedNiveau) {
            chargerSpecialites(selectedNiveau)
        } else {
            setSpecialites([])
            setSelectedSpecialite('')
        }
    }, [selectedNiveau])

    // Charger les sections disponibles
    useEffect(() => {
        if (selectedSpecialite) {
            chargerSections(selectedNiveau, selectedSpecialite)
        } else {
            setSections([])
            setSelectedSection('')
        }
    }, [selectedSpecialite, selectedNiveau])

    const chargerDonneesInitiales = async () => {
        try {
            // Récupérer tous les niveaux distincts des cours
            const { data: coursData, error } = await supabase
                .from('cours')
                .select('niveau')
                .not('niveau', 'is', null)
            
            if (error) {
                console.error('Erreur lors du chargement des niveaux:', error)
                return
            }

            const niveauxUniques = [...new Set(coursData.map(c => c.niveau).filter(Boolean))]
            setNiveaux(niveauxUniques.sort())
        } catch (error) {
            console.error('Erreur lors du chargement initial:', error)
        }
    }

    const chargerSpecialites = async (niveau: string) => {
        try {
            // Temporairement, utiliser les groupes en attendant que les cours aient des spécialités
            const { data, error } = await supabase
                .from('groupes')
                .select('specialite')
                .eq('niveau', niveau)
                .not('specialite', 'is', null)
            
            if (error) {
                console.error('Erreur lors du chargement des spécialités:', error)
                return
            }

            const specialitesUniques = [...new Set(data.map(g => g.specialite).filter(Boolean))]
            setSpecialites(specialitesUniques.sort())
        } catch (error) {
            console.error('Erreur lors du chargement des spécialités:', error)
        }
    }

    const chargerSections = async (niveau: string, specialite: string) => {
        try {
            // Temporairement, utiliser les groupes en attendant que les cours aient des spécialités
            const { data: groupesData, error: groupesError } = await supabase
                .from('groupes')
                .select('section_id')
                .eq('niveau', niveau)
                .eq('specialite', specialite)
            
            if (groupesError) {
                console.error('Erreur lors du chargement des groupes:', groupesError)
                return
            }

            const sectionIds = [...new Set(groupesData.map(g => g.section_id))]
            
            if (sectionIds.length === 0) {
                setSections([])
                return
            }

            // Récupérer les détails des sections
            const { data: sectionsData, error: sectionsError } = await supabase
                .from('sections')
                .select('id, nom')
                .in('id', sectionIds)
                .order('nom')
            
            if (sectionsError) {
                console.error('Erreur lors du chargement des sections:', sectionsError)
                return
            }

            setSections(sectionsData || [])
        } catch (error) {
            console.error('Erreur lors du chargement des sections:', error)
        }
    }

    const lancerGeneration = async () => {
        if (!selectedSection) {
            setMessage('Veuillez sélectionner une section.')
            return
        }

        setLoading(true)
        setMessage('')
        setDiagnostic('')
        
        const success = await genererEmploiDuTemps(selectedSection, setMessage)
        
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

    return (
        <AuthGuard>
            <div className="min-h-screen bg-gradient-to-br from-gray-50 to-indigo-100 p-4 sm:p-6 lg:p-8">
                <div className="max-w-7xl mx-auto">
                    <Header />
                    <h1 className="text-2xl font-bold mb-4 text-center">Génération automatique</h1>
                    <div className="bg-white p-6 rounded-2xl shadow-xl mb-8 border border-indigo-100">
                        <h2 className="text-lg font-semibold mb-4 text-gray-800">Sélection hiérarchique</h2>
                        
                        {/* Sélection en cascade */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                            {/* Niveau */}
                            <div>
                                <label htmlFor="niveau" className="block text-sm font-medium text-gray-700 mb-2">
                                    Niveau :
                                </label>
                                <select
                                    id="niveau"
                                    value={selectedNiveau}
                                    onChange={(e) => {
                                        setSelectedNiveau(e.target.value)
                                        setSelectedSpecialite('')
                                        setSelectedSection('')
                                    }}
                                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                    disabled={loading}
                                >
                                    <option value="">Sélectionner un niveau</option>
                                    {niveaux.map((niveau) => (
                                        <option key={niveau} value={niveau}>
                                            {niveau}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Spécialité */}
                            <div>
                                <label htmlFor="specialite" className="block text-sm font-medium text-gray-700 mb-2">
                                    Spécialité :
                                </label>
                                <select
                                    id="specialite"
                                    value={selectedSpecialite}
                                    onChange={(e) => {
                                        setSelectedSpecialite(e.target.value)
                                        setSelectedSection('')
                                    }}
                                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                    disabled={loading || !selectedNiveau}
                                >
                                    <option value="">Sélectionner une spécialité</option>
                                    {specialites.map((specialite) => (
                                        <option key={specialite} value={specialite}>
                                            {specialite}
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
                                    onChange={(e) => setSelectedSection(e.target.value)}
                                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                    disabled={loading || !selectedSpecialite}
                                >
                                    <option value="">Sélectionner une section</option>
                                    {sections.map((section) => (
                                        <option key={section.id} value={section.id}>
                                            {section.nom}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Informations de sélection */}
                        {selectedSection && (
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                                <h3 className="font-semibold text-blue-800 mb-2">Section sélectionnée :</h3>
                                <p className="text-blue-700">
                                    <strong>Niveau :</strong> {selectedNiveau} | 
                                    <strong> Spécialité :</strong> {selectedSpecialite} | 
                                    <strong> Section :</strong> {sections.find(s => s.id === selectedSection)?.nom}
                                </p>
                                <p className="text-blue-600 text-sm mt-2">
                                    💡 La génération créera un emploi du temps pour toute la section avec :
                                    <br/>• CM : Tous les groupes ensemble
                                    <br/>• TD/TP : Groupes séparés (partage de case possible)
                                </p>
                            </div>
                        )}

                        <div className="flex gap-4 mb-4 flex-wrap">
                            <button
                                onClick={verifierCohérenceLocale}
                                className="bg-red-600 text-white px-6 py-2 rounded hover:bg-red-700 disabled:opacity-50"
                                disabled={loading}
                            >
                                {loading ? 'Vérification...' : 'Vérifier la cohérence'}
                            </button>
                            <button
                                onClick={lancerDiagnostic}
                                className="bg-yellow-600 text-white px-6 py-2 rounded hover:bg-yellow-700 disabled:opacity-50"
                                disabled={loading || !selectedSection}
                            >
                                {loading ? 'Diagnostic...' : 'Diagnostiquer (version simple)'}
                            </button>
                            <button
                                onClick={lancerGeneration}
                                className="bg-indigo-600 text-white px-6 py-2 rounded hover:bg-indigo-700 disabled:opacity-50"
                                disabled={loading || !selectedSection}
                            >
                                {loading ? 'Génération...' : 'Générer automatiquement'}
                            </button>
                        </div>
                        {message && (
                            <div className="mb-4 p-3 rounded-md text-sm">
                                {message.includes('Erreur') || message.includes('échec') ? (
                                    <div className="text-red-700 bg-red-100 border border-red-300">
                                        {message}
                                    </div>
                                ) : (
                                    <div className="text-green-700 bg-green-100 border border-green-300">
                                        {message}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                    
                    {diagnostic && (
                        <div className="bg-white p-6 rounded-2xl shadow-xl border border-indigo-100">
                            <h2 className="text-xl font-bold mb-4">Résultat du diagnostic</h2>
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