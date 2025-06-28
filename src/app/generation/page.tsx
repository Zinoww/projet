'use client'
import { supabase } from '@/src/lib/supabaseClient'
import { useState, useEffect } from 'react'
import { genererEmploiDuTemps, diagnostiquerDonneesSimple, verifierCohérence, getDonneesReference, diagnostiquerSeances } from '@/src/lib/generation'
import Header from '@/src/components/Header'
import AuthGuard from '@/src/components/AuthGuard'

interface Section {
    id: string;
    nom: string;
}

export default function GenerationPage() {
    const [loading, setLoading] = useState(false)
    const [message, setMessage] = useState('')
    const [sections, setSections] = useState<Section[]>([])
    const [selectedSection, setSelectedSection] = useState<string>('')
    const [diagnostic, setDiagnostic] = useState<string>('')

    // Charger les sections au montage du composant
    useEffect(() => {
        const chargerSections = async () => {
            const { data, error } = await supabase
                .from('sections')
                .select('id, nom')
                .order('nom')
            
            if (data) {
                setSections(data)
                if (data.length > 0) {
                    setSelectedSection(data[0].id)
                }
            }
        }
        
        chargerSections()
    }, [])

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

    const afficherDonneesReference = async () => {
        setLoading(true)
        setMessage('')
        setDiagnostic('')
        try {
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Timeout: La requête a pris trop de temps')), 10000)
            );
            const referencePromise = getDonneesReference();
            const rapport = await Promise.race([referencePromise, timeoutPromise]) as string;
            setDiagnostic(rapport);
        } catch (error) {
            setDiagnostic(`❌ Erreur lors de la récupération des données de référence: ${error}\n\nEssayez de rafraîchir la page ou vérifiez votre connexion.`);
        }
        setLoading(false)
    }

    const diagnostiquerSeancesLocale = async () => {
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
            const seancesPromise = diagnostiquerSeances(selectedSection);
            const rapport = await Promise.race([seancesPromise, timeoutPromise]) as string;
            setDiagnostic(rapport);
        } catch (error) {
            setDiagnostic(`❌ Erreur lors du diagnostic des séances: ${error}\n\nEssayez de rafraîchir la page ou vérifiez votre connexion.`);
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
                        <div className="mb-4">
                            <label htmlFor="section" className="block text-sm font-medium text-gray-700 mb-2">
                                Sélectionner une section :
                            </label>
                            <select
                                id="section"
                                value={selectedSection}
                                onChange={(e) => setSelectedSection(e.target.value)}
                                className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                disabled={loading}
                            >
                                {sections.map((section) => (
                                    <option key={section.id} value={section.id}>
                                        {section.nom}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="flex gap-4 mb-4 flex-wrap">
                            <button
                                onClick={diagnostiquerSeancesLocale}
                                className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
                                disabled={loading || !selectedSection}
                            >
                                {loading ? 'Analyse...' : 'Analyser les séances'}
                            </button>
                            <button
                                onClick={afficherDonneesReference}
                                className="bg-purple-600 text-white px-6 py-2 rounded hover:bg-purple-700 disabled:opacity-50"
                                disabled={loading}
                            >
                                {loading ? 'Chargement...' : 'Données de référence'}
                            </button>
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