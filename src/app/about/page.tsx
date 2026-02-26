import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { Award, Users, Lightbulb, CheckCircle2, GraduationCap, Globe, BookOpen } from "lucide-react";

const values = [
    { icon: Award, title: "Excellence", desc: "We pursue the highest standards in everything we do." },
    { icon: Users, title: "Discipline", desc: "We foster responsibility, respect, and self-regulation." },
    { icon: Lightbulb, title: "Innovation", desc: "We embrace new ideas, technology, and creative thinking." },
    { icon: Globe, title: "Global Outlook", desc: "We prepare students for a connected, diverse world." },
];

const milestones = [
    "Excellence in Academics",
    "Holistic Development",
    "Global Perspective",
    "Innovation & Technology",
    "Character Building",
    "Community Engagement",
];

export default function AboutPage() {
    return (
        <div className="flex flex-col min-h-screen">
            <Navbar />

            {/* Hero Banner */}
            <section className="relative pt-[72px]">
                <div className="gradient-navy py-20 md:py-28">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
                        <span className="text-sm font-semibold uppercase tracking-wider text-gold">About Us</span>
                        <h1 className="text-4xl md:text-5xl font-bold text-white mt-3">
                            Our Story & <span className="text-gold">Vision</span>
                        </h1>
                        <p className="text-white/60 text-lg mt-4 max-w-xl mx-auto">
                            Providing world-class education with a focus on holistic development and global citizenship.
                        </p>
                    </div>
                </div>
            </section>

            <main className="flex-1">
                {/* Mission Section */}
                <section className="section-padding bg-white">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
                            <div className="space-y-6">
                                <span className="text-sm font-semibold uppercase tracking-wider text-gold">Our Mission</span>
                                <h2 className="section-heading">
                                    Empowering Students to Become{" "}
                                    <span className="text-gold">Lifelong Learners</span>
                                </h2>
                                <p className="section-subheading">
                                    We believe in nurturing creativity, fostering critical thinking, and building
                                    character through a rigorous and comprehensive curriculum that prepares students
                                    for the challenges of tomorrow.
                                </p>
                                <div className="grid sm:grid-cols-2 gap-3 pt-2">
                                    {milestones.map((item) => (
                                        <div key={item} className="flex items-center gap-3 p-3 rounded-xl bg-off-white">
                                            <CheckCircle2 className="w-5 h-5 text-gold shrink-0" />
                                            <span className="text-sm font-medium text-navy">{item}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div className="aspect-[4/3] rounded-2xl bg-gradient-to-br from-navy/5 to-gold/10 relative overflow-hidden shadow-lg">
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <div className="text-center space-y-3">
                                        <div className="w-16 h-16 rounded-2xl gradient-navy mx-auto flex items-center justify-center">
                                            <BookOpen className="w-8 h-8 text-white" />
                                        </div>
                                        <p className="text-sm text-gray-400 font-medium">Campus Image</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* History / Vision / Values Cards */}
                <section className="section-padding bg-off-white">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="grid md:grid-cols-3 gap-6">
                            <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100 card-hover">
                                <div className="w-12 h-12 rounded-xl gradient-navy flex items-center justify-center mb-5 shadow-md">
                                    <BookOpen className="w-6 h-6 text-white" />
                                </div>
                                <h3 className="font-bold text-xl text-navy mb-3">History</h3>
                                <p className="text-gray-500 text-sm leading-relaxed">
                                    Founded in 2005, we have grown from a small community school to a premier
                                    international institution with over 3,200 students and 145 dedicated faculty members.
                                </p>
                            </div>
                            <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100 card-hover">
                                <div className="w-12 h-12 rounded-xl gradient-navy flex items-center justify-center mb-5 shadow-md">
                                    <GraduationCap className="w-6 h-6 text-white" />
                                </div>
                                <h3 className="font-bold text-xl text-navy mb-3">Vision</h3>
                                <p className="text-gray-500 text-sm leading-relaxed">
                                    To be recognized globally as a center of excellence for education, innovation,
                                    and character building — shaping responsible citizens who contribute to society.
                                </p>
                            </div>
                            <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100 card-hover">
                                <div className="w-12 h-12 rounded-xl gradient-navy flex items-center justify-center mb-5 shadow-md">
                                    <Award className="w-6 h-6 text-white" />
                                </div>
                                <h3 className="font-bold text-xl text-navy mb-3">Values</h3>
                                <p className="text-gray-500 text-sm leading-relaxed">
                                    Integrity, Respect, Responsibility, and Excellence are the core values that guide
                                    our every action, decision, and interaction within the school community.
                                </p>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Core Values */}
                <section className="section-padding bg-white">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="text-center max-w-2xl mx-auto mb-12">
                            <span className="text-sm font-semibold uppercase tracking-wider text-gold">Foundation</span>
                            <h2 className="section-heading mt-3">
                                Our Core <span className="text-gold">Values</span>
                            </h2>
                        </div>
                        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
                            {values.map((v) => (
                                <div key={v.title} className="bg-off-white rounded-2xl p-6 text-center card-hover border border-gray-100">
                                    <div className="w-14 h-14 rounded-2xl gradient-navy mx-auto flex items-center justify-center mb-4 shadow-md">
                                        <v.icon className="w-7 h-7 text-white" />
                                    </div>
                                    <h3 className="font-bold text-navy mb-2">{v.title}</h3>
                                    <p className="text-sm text-gray-500">{v.desc}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>
            </main>

            <Footer />
        </div>
    );
}
