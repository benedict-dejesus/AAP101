/* ══════════════════════════════════════════════════════════════
   AAP101 · CONTENT LAYER
   All learning content preserved verbatim from the original module.
   Structure is declarative — app.js renders each block by its `t` type.
   ══════════════════════════════════════════════════════════════ */
'use strict';

/* The term label comes from config.js so a new semester is a one-line change. */
const AAP_TERM = (typeof window !== 'undefined' && window.AAP_CONFIG && window.AAP_CONFIG.TERM) || 'A.Y. 2026–2027';

/* ─────────── Museum labels ───────────
   Image path → what the artwork is. Only works whose source is known are
   listed; an image with no entry simply shows no label. Add an entry
   whenever you replace an image with a real, identifiable work. */
const ARTWORKS = {
  'images/image15.jpg': {title:'Girl with a Mandolin (Fanny Tellier)', artist:'Pablo Picasso', year:'1910', medium:'Oil on canvas'},
  'images/image19.jpg': {title:'Charing Cross Bridge, London', artist:'André Derain', year:'1906', medium:'Oil on canvas'},
  'images/image31.jpg': {title:'Under the Wave off Kanagawa (The Great Wave)', artist:'Katsushika Hokusai', year:'c. 1830–32', medium:'Woodblock print'}
};

/* ─────────── Guitar chord library (preserved) ─────────── */
const CHORDS = {
  A:{name:'A Major',type:'Open Major',strings:['x','o',null,null,null,'o'],fingers:[[2,2,1],[3,2,2],[4,2,3]],barre:null,desc:'A bright open chord. Use three fingers on the D, G, and B strings.',fing:['Index (1): D string, 2nd fret','Middle (2): G string, 2nd fret','Ring (3): B string, 2nd fret']},
  Am:{name:'A Minor',type:'Open Minor',strings:['x','o',null,null,null,'o'],fingers:[[2,2,2],[3,2,3],[4,1,1]],barre:null,desc:'A minor variant of A. Mute the low E string.',fing:['Index (1): B string, 1st fret','Middle (2): D string, 2nd fret','Ring (3): G string, 2nd fret']},
  B:{name:'B Major',type:'Barre Major',strings:['x',null,null,null,null,null],fingers:[[2,4,3],[3,4,4],[4,4,2]],barre:{fret:2,fromStr:1,toStr:5},desc:'B major (A-shape barre): x24442. Index bars at 2nd fret.',fing:['Index (1): Barre at 2nd fret (A->high e)','Middle (2): B string, 4th fret','Ring (3): D string, 4th fret','Pinky (4): G string, 4th fret']},
  Bm:{name:'B Minor',type:'Barre Minor',strings:['x',null,null,null,null,null],fingers:[[2,4,4],[3,4,3],[4,3,2]],barre:{fret:2,fromStr:1,toStr:5},desc:'B minor (xm shape) commonly played as a barre at 2nd fret (x24432).',fing:['Index (1): Barre at 2nd fret','Middle (2): B string, 3rd fret','Ring (3): D string, 4th fret','Pinky (4): G string, 4th fret']},
  Bb:{name:'Bb Major',type:'Barre Major',strings:['x',null,null,null,null,null],fingers:[[2,3,2],[3,3,3],[4,3,4]],barre:{fret:1,fromStr:1,toStr:5},desc:'Bb major often played as a small barre at 1st fret (x13331).',fing:['Index (1): Barre at 1st fret','Middle (2): D string, 3rd fret','Ring (3): G string, 3rd fret','Pinky (4): B string, 3rd fret']},
  C:{name:'C Major',type:'Open Major',strings:['x','o',null,'o',null,'o'],fingers:[[1,3,3],[2,2,2],[4,1,1]],barre:null,desc:'C major open chord. Mute the low E string.',fing:['Index (1): B string, 1st fret','Middle (2): D string, 2nd fret','Ring (3): A string, 3rd fret']},
  'C#m':{name:'C# Minor',type:'Barre Minor',strings:['x',null,null,null,null,null],fingers:[[2,6,3],[3,6,4],[4,5,2]],barre:{fret:4,fromStr:1,toStr:5},desc:'C# minor typically played as a barre at the 4th fret (x46654).',fing:['Index (1): Barre at 4th fret','Middle (2): B string, 5th fret','Ring (3): D string, 6th fret','Pinky (4): G string, 6th fret']},
  D:{name:'D Major',type:'Open Major',strings:['x','x','o',null,null,null],fingers:[[3,2,1],[4,3,3],[5,2,2]],barre:null,desc:'D major open chord. Only the top four strings are used.',fing:['Index (1): G string, 2nd fret','Middle (2): high e, 2nd fret','Ring (3): B string, 3rd fret']},
  Dm:{name:'D Minor',type:'Open Minor',strings:['x','x','o',null,null,'o'],fingers:[[3,2,2],[4,3,3],[5,1,1]],barre:null,desc:'D minor open chord.',fing:['Index (1): G string, 2nd fret','Middle (2): B string, 3rd fret','Ring (3): high e, 1st fret']},
  E:{name:'E Major',type:'Open Major',strings:['o',null,null,null,'o','o'],fingers:[[1,2,2],[2,2,3],[3,1,1]],barre:null,desc:'E major open chord. All six strings ring.',fing:['Index (1): G string, 1st fret','Middle (2): A string, 2nd fret','Ring (3): D string, 2nd fret']},
  Em:{name:'E Minor',type:'Open Minor',strings:['o',null,null,'o','o','o'],fingers:[[1,2,2],[2,2,3]],barre:null,desc:'E minor open chord (two fingers).',fing:['Middle (2): A string, 2nd fret','Ring (3): D string, 2nd fret']},
  F:{name:'F Major',type:'Barre Major',strings:[null,null,null,null,null,null],fingers:[[1,3,3],[2,3,4],[3,2,2]],barre:{fret:1,fromStr:0,toStr:5},desc:'F major full barre at 1st fret (133211).',fing:['Index (1): Full barre at 1st fret','Middle (2): G string, 2nd fret','Ring (3): D string, 3rd fret','Pinky (4): A string, 3rd fret']},
  'F#m':{name:'F# Minor',type:'Barre Minor',strings:[null,null,null,null,null,null],fingers:[[1,4,3],[2,4,4]],barre:{fret:2,fromStr:0,toStr:5},desc:'F# minor full barre at 2nd fret (244222).',fing:['Index (1): Full barre at 2nd fret','Ring (3): A string, 4th fret','Pinky (4): D string, 4th fret']}
};

const CHORD_ORDER = ['A','Am','B','Bm','Bb','C','C#m','D','Dm','E','Em','F','F#m'];
const CHORD_LABELS = {Bb:'B-flat'};

/* Strumming patterns — content preserved, made playable */
const STRUM_PATTERNS = [
  {name:'Whole Note',  beats:'4 beats',   pattern:'D (sustained to 4 beats)',        seq:['D','·','·','·']},
  {name:'Half Note',   beats:'2 beats',   pattern:'D – D (each sustained to 2 beats)', seq:['D','·','D','·']},
  {name:'Quarter Note',beats:'1 beat',    pattern:'D – D – D – D',                   seq:['D','D','D','D']},
  {name:'Eighth Note', beats:'½ beat',    pattern:'DU – DU – DU – DU',               seq:['D','U','D','U','D','U','D','U']},
  {name:'Sixteenth',   beats:'¼ beat',    pattern:'DUDU – DUDU – DUDU – DUDU',       seq:['D','U','D','U','D','U','D','U','D','U','D','U','D','U','D','U']}
];

/* ─────────── Lesson numbers shown to students ───────────
   `num` drives unlocking and saved progress; `no` (when set) is the number
   students see, so the welcome page can sit before Lesson 1 and the lesson
   numbers match the course syllabus and planner. */
function lessonNo(l){ return (l && l.no !== undefined) ? l.no : l.num; }
function lessonLabel(l){ const n = lessonNo(l); return n === 0 ? 'Welcome' : 'Lesson ' + n; }
function lessonIcon(l){ const n = lessonNo(l); return n === 0 ? '👋' : String(n); }

/* ─────────── Badge definitions ─────────── */
const BADGES = [
  {id:'first-steps', em:'👣', n:'First Steps',       d:'Open your first lesson'},
  {id:'shutterbug',  em:'📸', n:'Shutterbug',        d:'Reveal every studio polaroid'},
  {id:'sorter',      em:'🎯', n:'Clean Sort',        d:'Ace a sorting gauntlet on the first try'},
  {id:'curator',     em:'🖼️', n:'Curator',           d:'Discover all 9 functions of art'},
  {id:'flipper',     em:'🃏', n:'Movement Buff',     d:'Flip every art-movement card'},
  {id:'sharp-eye',   em:'👁️', n:'Sharp Eye',         d:'Nail a knowledge check with no misses'},
  {id:'matchmaker',  em:'🧩', n:'Matchmaker',        d:'Clear a memory match with a perfect run'},
  {id:'boss',        em:'⚔️', n:'Boss Slayer',       d:'Win a Speed Round'},
  {id:'perfect-boss',em:'💎', n:'Flawless Victory',  d:'Win a Speed Round with 100% accuracy'},
  {id:'combo5',      em:'🔥', n:'On Fire',           d:'Reach a 5-answer streak'},
  {id:'exposure',    em:'🌗', n:'Perfect Exposure',  d:'Nail the exposure triangle'},
  {id:'guitarist',   em:'🎸', n:'Chord Collector',   d:'View all 13 guitar chords'},
  {id:'midterm',     em:'🎨', n:'Midterm Master',    d:'Complete the Midterm Module'},
  {id:'final',       em:'🏆', n:'Final Term Champ',  d:'Complete the Final Term Module'},
  {id:'scholar',     em:'🎓', n:'Full Scholar',      d:'Complete both modules'}
];

/* ─────────── Level curve ─────────── */
const RANKS = [
  {lvl:1, xp:0,    name:'Apprentice',  em:'🎨'},
  {lvl:2, xp:150,  name:'Sketcher',    em:'✏️'},
  {lvl:3, xp:350,  name:'Colorist',    em:'🖌️'},
  {lvl:4, xp:600,  name:'Composer',    em:'🎭'},
  {lvl:5, xp:900,  name:'Artisan',     em:'🛠️'},
  {lvl:6, xp:1300, name:'Artist',      em:'🖼️'},
  {lvl:7, xp:1800, name:'Maestro',     em:'🎼'},
  {lvl:8, xp:2400, name:'Virtuoso',    em:'👑'}
];

/* ══════════════════════════════════════════════════════════════
   MODULES
   ══════════════════════════════════════════════════════════════ */
const CONTENT = {

/* ─────────────────────────────────────────────────────────────
   MIDTERM MODULE
   ───────────────────────────────────────────────────────────── */
m: {
  label:'Midterm Module',
  short:'Midterm',
  desc:'Lessons 1–7 covering Introduction to Art, Functions, Artists and Artisans, Art Movements, Visual Elements with the Coffee Painting Workshop and Project, Reading an Artwork, and Philippine Art and National Artists, then the Theater Play Viewing, the Midterm Quiz and the Midterm Exam.',
  doneIcon:'🎨',
  lessons:[

  /* ── M1 ── */
  {
    id:'m1', num:1, no:0, title:'About the Instructor', tag:'Midterm · Welcome',
    desc:'Meet the person guiding you through AAP101 this semester.',
    blocks:[
      {t:'quote', img:'images/image1.jpg', alt:'Sir Kito',
       html:'"Every human being is born with the potential to become an artist. Art Appreciation, being a humanities subject, will be one of the few things that will remain even when AI technology takes over the world."',
       attr:'– Benedict de Jesus (Sir Kito)'},

      {t:'text', html:`
        <p>Mr. Benedict C. de Jesus (Sir Kito) is a licensed professional English teacher who has been serving as a humble part-time instructor at Bulacan State University, teaching Art Appreciation and Communication subjects for 8 years. He is also an enthusiast of music, research, statistics, AI technology, and instructional design.</p>
        <p>He has been a freelance Research/Thesis consultant for 16 years and a frequent guest lecturer and workshop facilitator for the City Government of Malolos. Sir Kito is also a musician with over 25 years of experience and is active in instructional design and educational development.</p>`},

      {t:'text', html:`
        <p><strong>How this course works.</strong> The Midterm Module has seven lessons and the Final Term Module has four. Each lesson opens with an artwork to look at, teaches one idea, and ends with an activity that unlocks the next lesson.</p>
        <p>Activities earn XP and badges, and your progress saves to the class record automatically, so you can continue on any phone or computer with your access code. Quizzes and exams set by Sir Kito appear under <strong>Tests</strong>.</p>`},

      {t:'heading', lvl:3, text:'Course Planner'},

      {t:'text', html:`
        <p><strong>Midterm</strong></p>
        <ol>
          <li>Introduction to Art and Assumptions of Art <em>(Week 1, after the class orientation)</em></li>
          <li>Functions of Art <em>(Week 2)</em></li>
          <li>Artists and Artisans <em>(Week 3)</em></li>
          <li>Art Movements <em>(Week 4)</em></li>
          <li>Visual Elements of Art <em>(Week 5)</em>, with the Coffee Painting Classroom Workshop <em>(Week 6)</em> and the Midterm Project: Coffee Painting Self-Portrait</li>
          <li>Reading an Artwork <em>(Week 7)</em></li>
          <li>Philippine Art and National Artists <em>(Week 8)</em></li>
          <li>Midterm Activity: Theater Play Viewing, “Tanghalaya 2027” <em>(Week 9)</em></li>
          <li>Midterm Quiz <em>(Week 9)</em></li>
          <li>Midterm Exam <em>(Week 10)</em></li>
        </ol>
        <p style="margin-top:12px"><strong>Final Term</strong></p>
        <ol>
          <li>Principles of Design <em>(Week 11)</em></li>
          <li>Basic Photography <em>(Week 12)</em></li>
          <li>Final Term Activity: Photography Challenge <em>(Week 13)</em></li>
          <li>Basic Videography <em>(Week 14)</em></li>
          <li>Guitar Lessons for Beginners <em>(Week 15)</em>, with the Guitar Lesson Classroom Workshops <em>(2 meetings, Week 16)</em> and the Final Term Project: Live Guitar Performance <em>(Week 17)</em></li>
          <li>Final Term Quiz <em>(Week 17)</em></li>
          <li>Final Term Exam <em>(Week 18)</em></li>
        </ol>
        <p style="margin-top:12px">Grading for each term: Term Examination 30%, Quizzes 20%, Activities 20% (the classroom workshops, the Theater Play Viewing and the Photography Challenge), Projects 20% (the Coffee Painting Self-Portrait and the Live Guitar Performance) and Attendance 10%. Final rating = (Midterm Grade + Final Term Grade) ÷ 2. More than 5 absences in the semester means you are dropped from the subject.</p>`},

      {t:'polaroids', gate:'m1-gal', xp:40,
       title:'The Studio Wall', kicker:'Photo Reveal',
       instr:'These photos are still developing. <strong>Tap each polaroid</strong> to bring it into focus and unlock the next lesson.',
       items:[
         {img:'images/image2.jpg', alt:'Photo 1', cap:'Frame 01'},
         {img:'images/image3.jpg', alt:'Photo 2', cap:'Frame 02'},
         {img:'images/image4.jpg', alt:'Photo 3', cap:'Frame 03'},
         {img:'images/image5.jpg', alt:'Photo 4', cap:'Frame 04'}
       ]},

      {t:'continue', id:'cont-m1', req:['m1-gal'], label:'Continue to Lesson 1',
       note:'📸 Develop all 4 polaroids above to continue.', go:'m2', unlock:2}
    ]
  },

  /* ── M2 ── */
  {
    id:'m2', num:2, no:1, title:'Introduction to Art and Assumptions of Art', tag:'Midterm · Lesson 1',
    desc:'What actually counts as art — and what does not.',
    blocks:[
      {t:'quote', img:'images/image6.jpg', alt:'Art quote',
       html:'"Art is a man-made manifestation of <em>truth</em>, <em>beauty</em>, and <em>goodness</em>."'},

      {t:'text', html:`
        <p>Imagine going to the beach on a nice, warm Saturday afternoon. You witnessed an amazing golden hour sunset. What would you immediately do? Most likely, you would take a photo. That act — capturing, preserving, transforming an experience — is the heart of art.</p>
        <p>Art is the product of <strong>conscious human effort</strong>. People create art because we love to experience truth, beauty, and goodness over and over again. We want to preserve those experiences; hence, we transform them into something tangible — something we can keep and return to. That is what art is.</p>`},

      {t:'sorter', gate:'m2-dnd', xp:60, badgeOnPerfect:'sorter',
       title:'Sorting Gauntlet: Art or Nature?', kicker:'Drag & Drop Challenge',
       instr:'Classify each item as <strong>Art</strong> or <strong>Nature</strong>. Nature is created by natural processes; Art involves conscious human effort.<br><em>Desktop: drag &amp; drop. Mobile: tap an item to select it (turns green), then tap a category box to place it.</em>',
       items:[
         {id:'sunset',  label:'🌅 Sunset at the beach'},
         {id:'banaue',  label:'🌾 The Banaue Rice Terraces'},
         {id:'ai-img',  label:'🤖 AI-generated Images'},
         {id:'crush',   label:'💕 Your crush'},
         {id:'jeepney', label:'🚙 A hand-painted jeepney'},
         {id:'choco',   label:'⛰️ The Chocolate Hills of Bohol'}
       ],
       cats:[{id:'art', label:'🎨 Art'},{id:'nature', label:'🌿 Nature'}]},

      {t:'continue', id:'cont-m2-mid', req:['m2-dnd'], label:'Continue',
       note:'⚠️ Complete the sorting gauntlet above to continue.', reveal:'m2-sec-b'},

      {t:'reveal', id:'m2-sec-b', blocks:[
        {t:'heading', lvl:2, text:'Assumptions of Art'},

        {t:'discover', gate:'m2-tabs', xp:45, cols:3,
         title:'Three Assumptions', kicker:'Discovery Grid',
         instr:'Tap each tile to uncover an assumption of art. <strong>Uncover all 3</strong> to proceed.',
         items:[
           {label:'Art is not nature', ico:'🌿', img:'images/image7.jpg', alt:'Art is not nature',
            title:'Art is not nature.',
            html:'<p>Nature is the work of God or natural processes; Art is the work of <strong>conscious human effort</strong>. A sunset is beautiful, but it is not art. A painting of that sunset, however, is art. This distinction is fundamental: art requires a deliberate, purposeful human act of creation.</p>'},
           {label:'Art is experiential', ico:'✨', img:'images/image8.jpg', alt:'Art is experiential',
            title:'Art is experiential.',
            html:'<p>Art exists to be experienced. It engages our senses, emotions, and intellect. You don\'t just <em>look</em> at a painting — you <strong>feel</strong> it. You don\'t just <em>hear</em> music — you <strong>experience</strong> it. Without an audience to experience it, art loses a significant part of its purpose.</p>'},
           {label:'Art is expression', ico:'💬', img:'images/image9.jpg', alt:'Art as expression',
            title:'Art is a form of expression.',
            html:'<p>Art is one of the most powerful tools humans use to express emotions, ideas, stories, beliefs, and values. Whether it\'s a painting, a song, a poem, or a dance, art gives form to what we feel inside. It bridges the gap between the inner world and the outer world.</p>'}
         ]},

        {t:'quiz', mode:'multi', gate:'m2-kc', xp:75,
         title:'Spot the False Statements', kicker:'Knowledge Check',
         badgeText:'Select 2 FALSE statements',
         q:'Based on the Definition and Assumptions of Art, which <strong>two (2)</strong> statements are clearly <strong>FALSE</strong>? Select them below, then click Check Answers.',
         opts:[
           {txt:'Some people are natural-born artists. They were gifted with artistic skills because a certain hemisphere of their brain is more developed. Only these people can become artists.'},
           {txt:'Writing a song after a terrible breakup is a manifestation of how art can be used to vent emotions and transform them into something that helps us express ourselves.'},
           {txt:'AI-generated images can be considered as art because it still involves conscious human effort (people design and code the AI model, and people write the prompts).'},
           {txt:'While your crush is man-made, he/she may not be considered as art because his/her parents made no conscious effort in editing his/her appearance.'},
           {txt:'The Banaue Rice Terraces can be considered as art because it was handcrafted by the Ifugaos along the sides of the mountains — it was definitely man-made.'},
           {txt:'Mayon Volcano — regardless of its perfect cone shape — can still be considered as art because of its outstanding natural beauty.'}
         ]},

        {t:'continue', id:'cont-m2-end', req:['m2-tabs','m2-kc'], label:'Continue to Lesson 2',
         note:'⚠️ Complete all activities in this lesson to continue.', go:'m3', unlock:3}
      ]}
    ]
  },

  /* ── M3 ── */
  {
    id:'m3', num:3, no:2, title:'Functions of Art', tag:'Midterm · Lesson 2',
    desc:'Nine reasons humanity keeps making art.',
    blocks:[
      {t:'heading', lvl:2, text:'Functions of Art'},

      {t:'discover', gate:'m3-tabs', xp:90, cols:3, badgeOnDone:'curator',
       title:'The Function Map', kicker:'Discovery Grid',
       instr:'Nine functions are hidden below. <strong>Tap every tile</strong> to add it to your collection — then test yourself in the match game underneath.',
       items:[
         {label:'Personal', ico:'💗', title:'Personal Function',
          html:'<p>Art is created because we want to, because we love to, and because it is who we are. The personal function is intrinsic — it fulfills our inner need for expression and creativity. Examples include writing poems, personal photography, journaling, vlogging, or sketching. This function prioritizes the artist\'s own emotional or creative satisfaction over any external purpose.</p>'},
         {label:'Social', ico:'🤝', title:'Social Function',
          html:'<p>Art is used to form connections with other people and build communities. It brings people together, fosters shared experiences, and creates bonds. Examples include joining art groups, writing a song for someone, collaborative murals, community theater, and social movements powered by music or visual art. Art in this context is a bridge between individuals and communities.</p>'},
         {label:'Economic', ico:'💰', title:'Economic Function',
          html:'<p>Art is created to earn money or make a living. This function recognizes art as an industry and a livelihood. Examples include artisanry (crafting handmade goods for sale), commission-based art, tattoo art, fashion design, music production, architecture, and film. The creative economy is one of the fastest-growing sectors globally.</p>'},
         {label:'Religious', ico:'⛪', title:'Religious Function',
          html:'<p>Art is used for worship, spiritual expression, or to strengthen faith. This is one of the oldest functions of art. Examples include church architecture, religious icons, stained glass windows, devotional music, religious artifacts (crosses, santos, ritual items), and sacred dance or performance.</p>'},
         {label:'Political', ico:'✊', title:'Political Function',
          html:'<p>Art is used to show support or express disdain for political figures, schemes, propaganda, or ideas. Examples include election campaign jingles, political cartoons, protest songs, burning of effigies of political personalities, patriotic anthems, revolutionary posters, and documentary films exposing injustice.</p>'},
         {label:'Historical', ico:'📜', title:'Historical Function',
          html:'<p>Art is used to preserve, document, and communicate history. Before written language, humans told their stories through cave paintings and carvings. Today, art continues to record our collective memory. Examples include museums, archival photography, historical paintings, documentary films, war monuments, folk songs, and oral traditions.</p>'},
         {label:'Cultural', ico:'🪘', title:'Cultural Function',
          html:'<p>Art is used to promote and preserve culture, traditions, and identity. Examples include folk dances depicting regional culture (e.g., Tinikling, Singkil), indigenous crafts, regional cuisine, traditional music, festivals, and costumes that reflect ethnic heritage. It is one of the most powerful ways a community expresses who they are.</p>'},
         {label:'Physical', ico:'💃', title:'Physical Function',
          html:'<p>Art is used for physical and mental wellness. Examples include Zumba (rhythmic fitness dance), TikTok choreography (physical activity + creative expression), art therapy (used in clinical psychology to process trauma), dance therapy, and music therapy. This function recognizes the therapeutic and health-promoting aspects of artistic expression.</p>'},
         {label:'Aesthetic', ico:'💅', title:'Aesthetic Function',
          html:'<p>Art is used to beautify ourselves, other people, or our surroundings. Examples include tattoos, piercings, body augmentation, graffiti art, interior design, landscaping, fashion, and jewelry. When art transforms an environment or person into something more beautiful, it serves an aesthetic function.</p>'}
       ]},

      {t:'match', gate:'m3-match', xp:70,
       title:'Function Match', kicker:'Memory Minigame',
       instr:'Pair each <strong>function</strong> with a real-world example from the lesson. Tap a function, then tap its match. Fewer misses = more XP.',
       pairs:[
         {a:'Personal',   b:'Journaling & sketching for yourself'},
         {a:'Social',     b:'A collaborative community mural'},
         {a:'Economic',   b:'Commission-based tattoo art'},
         {a:'Religious',  b:'The carved retablo of a Baroque church'},
         {a:'Political',  b:'Protest songs & political cartoons'},
         {a:'Historical', b:'War monuments & archival photos'},
         {a:'Cultural',   b:'Tinikling and Singkil folk dances'},
         {a:'Physical',   b:'Art therapy & Zumba'},
         {a:'Aesthetic',  b:'Graffiti, tattoos & interior design'}
       ]},

      {t:'quiz', mode:'single', gate:'m3-kc', xp:50,
       title:'Look Closer: The Bulul', kicker:'Knowledge Check',
       q:'The Ifugao carve <strong>bulul</strong>, wooden figures placed in rice granaries and honored in rituals to protect and bless the harvest. Which function of art does the bulul <strong>mainly</strong> serve?',
       opts:[
         {txt:'Economic'},
         {txt:'Religious'},
         {txt:'Aesthetic'},
         {txt:'Physical'}
       ]},

      {t:'continue', id:'cont-m3', req:['m3-tabs','m3-match','m3-kc'], label:'Continue to Lesson 3',
       note:'⚠️ Discover all 9 functions, clear the match game and answer the check to continue.', go:'m4', unlock:4}
    ]
  },

  /* ── M4 ── */
  {
    id:'m4', num:4, no:3, title:'Artists and Artisans', tag:'Midterm · Lesson 3',
    desc:'Expression versus craft — where is the line?',
    blocks:[
      {t:'heading', lvl:2, text:'Artists and Artisans'},

      {t:'compare', items:[
        {img:'images/image10.jpg', alt:'Artist', badge:'Expression', h:'🎨 Artists',
         html:'<p>Artists focus on <strong>aesthetic and conceptual expression</strong>. They create art — such as paintings, sculptures, or music — primarily to provoke emotion, challenge ideas, or express a personal vision. The output does not need a practical, real-world utility. A painter who creates a canvas purely for beauty, emotion, or a message is an artist.</p>'},
        {img:'images/image11.jpg', alt:'Artisan', badge:'Craft', h:'🛠️ Artisans',
         html:'<p>Artisans focus on <strong>craftsmanship and functionality</strong>. They are highly skilled manual workers who create functional, utilitarian objects — such as furniture, pottery, clothing, or bread — by hand. While their work can be beautiful, it is designed with a specific practical purpose in mind. A potter who makes clay jars for everyday use is an artisan.</p>'}
      ]},

      {t:'text', html:`
        <p><strong>Artisans are honored too.</strong> The Philippines recognizes master folk artisans through the <strong>Gawad sa Manlilikha ng Bayan</strong> (GAMABA, the National Living Treasures Award), created by Republic Act 7355 in 1992. Awardees include weavers, potters, carvers and musicians who keep a community's craft alive, such as the T'boli <em>t'nalak</em> weaver Lang Dulay.</p>
        <p>The line between artist and artisan is about <strong>purpose</strong>, not skill. A woven t'nalak cloth is made to be worn and used in ritual, so its maker is an artisan, even though the work is beautiful and highly skilled.</p>`},

      {t:'sorter', gate:'m4-dnd', xp:60, badgeOnPerfect:'sorter',
       title:'Sorting Gauntlet: Artist or Artisan?', kicker:'Drag & Drop Challenge',
       instr:'Classify each professional as an <strong>Artist</strong> or an <strong>Artisan</strong> based on the definitions above.<br><em>Desktop: drag &amp; drop. Mobile: tap to select, then tap a category to place.</em>',
       items:[
         {id:'potter',       label:'🏺 Potter'},
         {id:'painter',      label:'🖌️ Painter'},
         {id:'photographer', label:'📸 Photographer'},
         {id:'buntal',       label:'🎩 Buntal Hat-Maker'},
         {id:'weaver',       label:"🧶 T'nalak Weaver"},
         {id:'filmmaker',    label:'🎬 Independent Filmmaker'}
       ],
       cats:[{id:'artist', label:'🎨 Artists'},{id:'artisan', label:'🛠️ Artisans'}]},

      {t:'continue', id:'cont-m4', req:['m4-dnd'], label:'Continue to Lesson 4',
       note:'⚠️ Complete the sorting gauntlet to continue.', go:'m5', unlock:5}
    ]
  },

  /* ── M5 ── */
  {
    id:'m5', num:5, no:4, title:'Art Movements', tag:'Midterm · Lesson 4',
    desc:'Eight movements that reshaped how the world sees.',
    blocks:[
      {t:'heading', lvl:2, text:'Art Movements'},

      {t:'text', html:'<p>Art movements are periods in art history defined by a shared style, technique, or philosophy. Understanding art movements helps you analyze and appreciate artworks with greater depth. <strong>Tap/click each card to flip it</strong> and reveal a representative artwork from that movement.</p>'},

      {t:'flipdeck', gate:'m5-flip', xp:80, badgeOnDone:'flipper',
       title:'Movement Cards', kicker:'Flip to Reveal',
       instr:'Flip all 8 cards to unlock the knowledge check.',
       items:[
         {img:'images/image12.jpg', alt:'Realism', title:'Realism',
          def:'Realism focuses on truthful, unidealized depiction of everyday life and ordinary people — rejecting romanticism and dramatic embellishment. Realist artists portray subjects with attention to detail and social context.'},
         {img:'images/image13.jpg', alt:'Impressionism', title:'Impressionism',
          def:'Impressionism emphasizes capturing the fleeting effects of light and color, often using loose brushwork and outdoor scenes to convey an impression of a moment rather than precise detail.'},
         {img:'images/image14.jpg', alt:'Expressionism', title:'Expressionism',
          def:'Expressionism prioritizes emotional experience over physical reality, using exaggerated forms, vivid colors, and distortion to convey inner feelings, angst, or psychological states.'},
         {img:'images/image15.jpg', alt:'Cubism', title:'Cubism',
          def:'Cubism breaks objects into geometric shapes and multiple viewpoints, representing subjects from several angles simultaneously to emphasize structure and form.'},
         {img:'images/image16.jpg', alt:'Surrealism', title:'Surrealism',
          def:'Surrealism explores dream imagery, the unconscious, and unexpected juxtapositions to reveal hidden truths and provoke thought beyond rational constraints.'},
         {img:'images/image17.jpg', alt:'Abstract Art', title:'Abstract Art',
          def:'Abstract art uses shapes, colors, forms, and gestural marks to achieve its effect rather than depicting real-world visual references; it can be non-representational or symbolic.'},
         {img:'images/image18.jpg', alt:'Pop Art', title:'Pop Art',
          def:'Pop Art draws from popular and consumer culture—advertising, comics, mass media—and often employs bold imagery, irony, and repetition to comment on contemporary life.'},
         {img:'images/image19.jpg', alt:'Fauvism', title:'Fauvism',
          def:'Fauvism emphasizes painterly qualities and strong color over representational or realistic values. Artists use vivid, non-naturalistic colors and simplified forms.'}
       ]},

      {t:'text', html:`
        <p><strong>Movements at home.</strong> Filipino artists took these international styles and made them their own:</p>
        <ul>
          <li><strong>Fernando Amorsolo</strong> painted sunlit rural scenes with his signature <em>backlighting</em>, glowing figures set against the light.</li>
          <li><strong>Vicente Manansala</strong> developed <em>transparent cubism</em>, layering see-through geometric planes over everyday Filipino subjects.</li>
          <li><strong>Ang Kiukok</strong> used the distorted, anguished forms of <em>expressionism</em> to show human struggle.</li>
          <li><strong>Fernando Zóbel</strong> moved into <em>abstraction</em>, building calm compositions from line and tone alone.</li>
        </ul>`},

      {t:'quiz', mode:'single', gate:'m5-kc', xp:60,
       title:'Read the Artwork', kicker:'Knowledge Check',
       q:'Which art movement would best describe the image below?',
       img:'images/image20.jpg', imgAlt:'Which movement?',
       opts:[
         {txt:'Cubism'},
         {txt:'Surrealism'},
         {txt:'Abstract Art'},
         {txt:'Pop Art'},
         {txt:'Fauvism'},
         {txt:'Realism'},
         {txt:'Expressionism'},
         {txt:'Impressionism'}
       ]},

      {t:'boss', gate:'m5-boss', xp:120, optional:true,
       title:'Speed Round: Name That Movement', emoji:'⚔️',
       desc:'Eight movements. Ten seconds each. Every correct answer in a row multiplies your XP. Ready to prove you know your art history?',
       time:10,
       questions:[
         {q:'Which movement breaks objects into geometric shapes and multiple viewpoints at once?',
          opts:['Realism','Fauvism','Impressionism','Cubism']},
         {q:'Which movement captures fleeting effects of light with loose brushwork?',
          opts:['Realism','Surrealism','Impressionism','Pop Art']},
         {q:'Which movement explores dream imagery and the unconscious mind?',
          opts:['Surrealism','Cubism','Abstract Art','Expressionism']},
         {q:'Which movement draws from advertising, comics, and consumer culture?',
          opts:['Fauvism','Realism','Impressionism','Pop Art']},
         {q:'Which movement shows everyday life truthfully, without idealization?',
          opts:['Cubism','Realism','Surrealism','Pop Art']},
         {q:'Which movement uses vivid, non-naturalistic color above all else?',
          opts:['Fauvism','Realism','Impressionism','Cubism']},
         {q:'Which movement distorts form to convey inner emotion and angst?',
          opts:['Pop Art','Realism','Expressionism','Fauvism']},
         {q:'Which movement can be entirely non-representational?',
          opts:['Cubism','Abstract Art','Realism','Impressionism']}
       ]},

      {t:'continue', id:'cont-m5', req:['m5-flip','m5-kc'], label:'Continue to Lesson 5',
       note:'⚠️ Flip all 8 cards and answer the knowledge check to continue.', go:'m6', unlock:6}
    ]
  },

  /* ── M6 ── */
  {
    id:'m6', num:6, no:5, title:'Visual Elements of Art & Midterm Project', tag:'Midterm · Lesson 5',
    desc:'The seven building blocks, the Coffee Painting Workshop, and your Midterm Project.',
    blocks:[
      {t:'heading', lvl:2, text:'Visual Elements of Art'},

      {t:'deck', gate:'m6-car', xp:70,
       title:'The Seven Elements', kicker:'Card Deck',
       instr:'Swipe through all 7 elements. Use ← → arrow keys, the buttons, or the dots.',
       items:[
         {img:'images/image21.jpg', alt:'Line', title:'Line',
          html:'<p>A mark that connects two points. Lines vary in length, width, direction, and style to create shapes, patterns, or movement. Lines guide the viewer\'s eye and can convey emotion — a curved line feels gentle, while a jagged line feels tense or energetic.</p>'},
         {img:'images/image22.jpg', alt:'Shape', title:'Shape',
          html:'<p>A flat, two-dimensional area defined by lines, colors, or textures. Shapes can be geometric (circles, squares, triangles) or organic (natural, irregular forms that occur in nature). Shapes are the building blocks of visual composition.</p>'},
         {img:'images/image23.jpg', alt:'Form', title:'Form',
          html:'<p>A three-dimensional object with height, width, and depth. Forms can be actual (sculptures, pottery) or implied through shading and perspective. Unlike shape, form exists in or gives the illusion of real three-dimensional space.</p>'},
         {img:'images/image24.jpg', alt:'Color', title:'Color',
          html:'<p>The visual element produced by light. Color includes three properties: <strong>Hue</strong> (the name of the color), <strong>Value</strong> (lightness or darkness), and <strong>Intensity</strong> (brightness or dullness). Color is one of the most expressive elements, capable of evoking strong emotions.</p>'},
         {img:'images/image25.jpg', alt:'Value', title:'Value',
          html:'<p>The lightness or darkness of a color or tone. Value creates contrast, depth, and the illusion of form. A full range of values — from the lightest light to the darkest dark — gives an artwork dimension and realism through shadows and highlights.</p>'},
         {img:'images/image26.jpg', alt:'Texture', title:'Texture',
          html:'<p>The surface quality of an artwork. Texture may be <strong>actual</strong> (felt by touch, as in sculpture) or <strong>visual/implied</strong> (appears textured but is smooth). Artists use texture to add tactile richness and reinforce the subject matter.</p>'},
         {img:'images/image27.jpg', alt:'Space', title:'Space',
          html:'<p>The area around, between, above, below, or within objects. <strong>Positive space</strong> refers to subjects or main areas of interest; <strong>negative space</strong> refers to empty areas around or between subjects. Both are equally important in creating a balanced, intentional composition.</p>'}
       ]},

      {t:'heading', lvl:2, text:'Coffee Painting Classroom Workshop'},

      {t:'text', html:`
        <p>In <strong>Week 6</strong> we paint together in class. You will practice the coffee washes, the value scale and the layering you need for your Midterm Project, using line, shape, value, texture and space from the deck above. Your workshop output is graded as a performance task.</p>
        <p><strong>Bring:</strong> instant coffee, water, two small containers, brushes of different sizes, a pencil and eraser, thick watercolor paper or vellum board, a palette or paper plate, and tissue or a rag.</p>`},

      {t:'rubric', kicker:"Rubric R1 \u00b7 How it is scored", title:"Coffee Painting Classroom Workshop", when:"Week 6 · in class",
       task:"Paint a five-step coffee value scale and a small still life or study using coffee washes, layering and dry-brush, applying the visual elements from this lesson.",
       crit:[
         {name:"Value scale and washes", pts:30, ex:"Five clearly distinct values from lightest to darkest; washes are smooth and even."},
         {name:"Layering and edges", pts:25, ex:"Waits for each layer to dry; builds depth with clean hard and soft edges."},
         {name:"Use of the visual elements", pts:25, ex:"Line, shape, value, texture and space are used on purpose and work together."},
         {name:"Work habits and participation", pts:20, ex:"Prepared with all materials, follows each step, keeps the area clean, helps classmates."}
       ]},

      {t:'heading', lvl:2, text:'Midterm Project: Coffee Painting Self-Portrait'},

      {t:'timeline', gate:'m6-quest', xp:60,
       title:'Project Quest Log', kicker:'9-Step Roadmap',
       instr:'Tap a step to expand it, then tick it off as you go. Your progress is saved — use this as your working checklist.',
       steps:[
         {title:'Gather Materials',
          html:'<p>Prepare all materials needed:</p><ul><li>Instant coffee or brewed coffee</li><li>Water</li><li>Small containers for mixing</li><li>Paintbrushes of different sizes</li><li>Pencil and eraser</li><li>Thick Watercolor paper or Vellum Board</li><li>Mixing palette or paper plate</li><li>Tissue or paper towel</li><li>Mirror or reference photo of yourself</li></ul>'},
         {title:'Observe and Study the Subject',
          html:'<p>Look carefully at your face using a mirror or a reference photograph. Observe your face shape, hair style, eye shape, nose and mouth proportions, and any distinctive facial features that make you uniquely you.</p>'},
         {title:'Create a Light Pencil Sketch',
          html:'<p>Using a pencil, lightly sketch the basic structure of your face. Start with the head shape, eye line, nose placement, mouth placement, hair outline, and neck and shoulders. Avoid pressing too hard so pencil marks can be easily erased.</p>'},
         {title:'Prepare Different Coffee Tones',
          html:'<p>Mix coffee with varying amounts of water to create different shades:</p><ul><li><strong>Light mixture</strong> = light brown tones</li><li><strong>Medium mixture</strong> = midtones</li><li><strong>Concentrated mixture</strong> = dark brown/shadow tones</li></ul><p>Test each mixture on scrap paper before applying to the artwork.</p>'},
         {title:'Apply the Lightest Tones',
          html:'<p>Begin painting with the lightest coffee mixture. Paint base skin tones, light areas of the face, and background if desired. <strong>Allow each layer to dry before adding darker tones.</strong></p>'},
         {title:'Add Midtones',
          html:'<p>Using a medium-strength coffee mixture, paint areas with moderate shadows. Focus on hair details, sides of the nose, cheeks, neck, and clothing. Work carefully to maintain facial proportions and likeness.</p>'},
         {title:'Add Shadows and Details',
          html:'<p>Use the darkest coffee mixture to create contrast. Enhance the eyes and eyelashes, eyebrows, hair shadows, nose contours, mouth details, and areas beneath the chin. Apply darker tones sparingly for stronger visual impact.</p>'},
         {title:'Refine and Blend',
          html:'<p>Review the portrait and make adjustments. Soften harsh edges with a damp brush. Add additional layers for darker values. Improve details and texture. <strong>Allow each layer to dry completely before adding another.</strong></p>'},
         {title:'Submission',
          html:'<p>Take <strong>2 photos</strong> of the finished portrait:</p><ol><li>One close-up with the reference image beside it</li><li>One with you holding your finished work</li></ol><p style="margin-top:10px">Then write a <strong>150–250 word reflection</strong>: which visual elements you used and why, what was hardest, and what you learned.</p><p style="margin-top:10px">Upload both photos and your reflection to your designated folder in the class GDrive by <strong>Week 9</strong>.</p>'}
       ]},

      {t:'rubric', kicker:"Rubric R3 \u00b7 How it is scored", title:"Midterm Project: Coffee Painting Self-Portrait", when:"Submit by Week 9",
       task:"Paint a self-portrait using only coffee and water, following the Project Quest Log above. Submit two photos and a 150–250 word reflection.",
       crit:[
         {name:"Likeness and proportion", pts:25, ex:"Recognizable likeness; facial proportions and placement are accurate."},
         {name:"Value range and tonal depth", pts:25, ex:"Full range from light to very dark; shadows model the face convincingly."},
         {name:"Technique", pts:20, ex:"Clean layering and blending, controlled edges, no blooms or tears."},
         {name:"Composition and visual elements", pts:15, ex:"Thoughtful placement, background and use of line, texture and space."},
         {name:"Reflection and submission", pts:15, ex:"Reflection explains choices, challenges and learning; both photos submitted on time in the correct folder."}
       ],
       note:"Pure coffee only: no paint, ink, filters, digital edits or AI-generated images."},

      {t:'continue', id:'cont-m6', req:['m6-car'], label:'Continue to Lesson 6',
       note:'⚠️ Navigate through all 7 Visual Elements in the deck to continue.', go:'m7', unlock:7}
    ]
  },

  /* ── M7 ── */
  {
    id:'m7', num:7, no:6, title:'Reading an Artwork', tag:'Midterm · Lesson 6',
    desc:'Four steps for talking about any artwork with confidence.',
    blocks:[
      {t:'text', html:`
        <p>"I like it" and "I don't get it" are where most people stop. Art critics go further by following a method. The best known is <strong>Edmund Feldman's</strong> four-step approach to art criticism, which moves from what you <em>see</em> to what you <em>think</em>.</p>
        <p>The order matters. You describe and analyze before you interpret, so your opinion rests on evidence in the artwork rather than a first impression.</p>`},

      {t:'discover', gate:'m7-tabs', xp:50, cols:2,
       title:"Feldman's Four Steps", kicker:'Discovery Grid',
       instr:'Tap each step to see what it asks. <strong>Uncover all 4</strong> to continue.',
       items:[
         {label:'1 · Describe', ico:'👁️', title:'Step 1: Describe',
          html:'<p><strong>What do you see?</strong> List only facts anyone could agree on: the title, artist, medium and size, then the subjects, objects, colors and shapes in the work. No opinions yet.</p><p><em>Example: "A woman in a white dress walks through a rice field. The sun is behind her."</em></p>'},
         {label:'2 · Analyze', ico:'📐', title:'Step 2: Analyze',
          html:'<p><strong>How is it organized?</strong> Use the elements of art and principles of design. Where is the focal point? How do line, color and value lead your eye? Is it balanced or tense?</p><p><em>Example: "Warm yellows dominate, and the bright backlight makes the figure the focal point."</em></p>'},
         {label:'3 · Interpret', ico:'💭', title:'Step 3: Interpret',
          html:'<p><strong>What does it mean?</strong> Say what you think the artwork expresses, its mood, message or idea, and point to the evidence from steps 1 and 2.</p><p><em>Example: "The glowing light makes farm work feel peaceful and dignified."</em></p>'},
         {label:'4 · Judge', ico:'⚖️', title:'Step 4: Judge',
          html:'<p><strong>Is it successful?</strong> Decide whether the artwork achieves what it sets out to do, and why. Judge it by its purpose, its technique or its impact, not only by whether you like it.</p><p><em>Example: "It succeeds: the lighting carries the mood the artist wanted."</em></p>'}
       ]},

      {t:'sorter', gate:'m7-dnd', xp:70, badgeOnPerfect:'sorter',
       title:'Sorting Gauntlet: Which Step?', kicker:'Drag & Drop Challenge',
       instr:'Each statement comes from a student\'s critique. Place it under the step it belongs to.<br><em>Desktop: drag &amp; drop. Mobile: tap a statement, then tap a step.</em>',
       items:[
         {id:'s-desc1', label:'The painting shows three fishermen pulling a net.'},
         {id:'s-desc2', label:'It is an oil painting, about one meter wide.'},
         {id:'s-ana1',  label:'Diagonal lines of the net lead the eye to the center.'},
         {id:'s-ana2',  label:'Dark values on the left balance the bright sky on the right.'},
         {id:'s-int1',  label:'The work seems to honor hard, shared labor.'},
         {id:'s-int2',  label:'The stormy sky suggests the danger of life at sea.'},
         {id:'s-jud1',  label:'It succeeds because every element supports its message.'},
         {id:'s-jud2',  label:'The crowded corner weakens an otherwise strong work.'}
       ],
       cats:[{id:'describe', label:'1 · Describe'},{id:'analyze', label:'2 · Analyze'},{id:'interpret', label:'3 · Interpret'},{id:'judge', label:'4 · Judge'}]},

      {t:'continue', id:'cont-m7', req:['m7-tabs','m7-dnd'], label:'Continue to Lesson 7',
       note:'⚠️ Uncover all 4 steps and clear the sorting gauntlet to continue.', go:'m8', unlock:8}
    ]
  },

  /* ── M8 ── */
  {
    id:'m8', num:8, no:7, title:'Philippine Art and National Artists', tag:'Midterm · Lesson 7',
    desc:'The Filipino artists the nation chose to honor.',
    blocks:[
      {t:'text', html:`
        <p>The <strong>Order of National Artists</strong> (Orden ng Pambansang Alagad ng Sining) is the highest honor the Philippines gives to artists. It was created in 1972, and <strong>Fernando Amorsolo</strong> was its first awardee. National Artists are named by the President on the recommendation of the National Commission for Culture and the Arts (NCCA) and the Cultural Center of the Philippines (CCP).</p>
        <p>The award covers many fields, including visual arts, music, dance, theater, literature, film and broadcast arts, and architecture. Earlier masters such as <strong>Juan Luna</strong>, whose <em>Spoliarium</em> won a gold medal in Madrid in 1884, lived before the award existed, so they are honored as national heroes of art rather than as National Artists.</p>`},

      {t:'match', gate:'m8-match', xp:70,
       title:'Know Your National Artists', kicker:'Memory Minigame',
       instr:'Pair each <strong>National Artist for Visual Arts</strong> with what they are known for. Tap a name, then tap its match.',
       pairs:[
         {a:'Fernando Amorsolo',    b:'Sunlit rural scenes with backlighting'},
         {a:'Botong Francisco',     b:'Large murals of Philippine history'},
         {a:'Vicente Manansala',    b:'Transparent cubism'},
         {a:'Napoleon Abueva',      b:'Father of modern Philippine sculpture'},
         {a:'Ang Kiukok',           b:'Anguished expressionist figures'},
         {a:'Benedicto "BenCab" Cabrera', b:'The Sabel series'}
       ]},

      {t:'quiz', mode:'single', gate:'m8-kc', xp:50,
       title:'The First National Artist', kicker:'Knowledge Check',
       q:'The Order of National Artists was created in 1972. Who was its <strong>first</strong> awardee?',
       opts:[
         {txt:'Juan Luna'},
         {txt:'Fernando Amorsolo'},
         {txt:'Vicente Manansala'},
         {txt:'Botong Francisco'}
       ]},

      {t:'text', html:`
        <p><strong>Try it yourself.</strong> Pick one work by a National Artist, at the National Museum of Fine Arts in Manila or online, and read it with Feldman's four steps from Lesson 6. It is good practice for your Midterm Project reflection.</p>`},

      {t:'heading', lvl:2, text:'Midterm Activity: Theater Play Viewing, “Tanghalaya 2027”'},

      {t:'text', html:`
        <p>In <strong>Week 9</strong> the class watches <strong>“Tanghalaya 2027”</strong>. Sir Kito will announce the venue, schedule and ticket details in class.</p>
        <p><strong>While watching</strong>, notice the elements of theater: the script and story, the actors, the set and costumes, the lighting, and the music and sound. Please follow theater etiquette: arrive early, keep your phone silent and put away, and do not record the performance.</p>
        <p><strong>How it is scored:</strong> watching the whole play earns the <strong>full points</strong> for the Midterm Activity. There is no reaction or reflection paper to write. Enjoy the show, and use what you learned in Lesson 6 to look closely at what the artists on stage are doing.</p>`},

      {t:'rubric', kicker:"Rubric R2 \u00b7 How it is scored", title:"Theater Play Viewing: “Tanghalaya 2027”", when:"Week 9",
       task:"Watch the full performance of “Tanghalaya 2027” with the class. No written output is required.",
       crit:[
         {name:"Watched the full play", pts:100, ex:"Present from the start of the performance to the curtain call, following theater etiquette."}
       ],
       note:"Did not watch = 0. If you miss it for a valid, documented reason, talk to Sir Kito: a make-up viewing may be allowed at the instructor’s discretion."},

      {t:'heading', lvl:3, text:'Midterm Quiz and Midterm Exam'},

      {t:'text', html:'<p>The <strong>Midterm Quiz</strong> (Week 9) and the <strong>Midterm Exam</strong> (Week 10) cover Lessons 1 to 7. Both are taken here in the module, under <strong>Tests</strong>, when Sir Kito opens them.</p>'},

      {t:'continue', id:'cont-m8', req:['m8-match','m8-kc'], label:'Complete Midterm Module 🎉',
       note:'⚠️ Clear the match game and answer the check to complete this module.', go:'mc'}
    ]
  }
  ],

  complete:{
    id:'mc', icon:'🎉', title:'Midterm Module Complete!', conf:'🎨 ✨ 🖌️ 🎭 ✨ 🎨',
    badge:'midterm',
    html:"Congratulations! You've successfully completed the <strong>Midterm Learning Module</strong> for AAP101. You've covered the foundations of Art Appreciation — from the definition of art, its functions, artists vs. artisans, major art movements and the visual elements, to reading an artwork and the National Artists of the Philippines. Good luck on your Coffee Painting Self-Portrait, enjoy “Tanghalaya 2027”, and do your best in the Midterm Quiz and Exam!"
  }
},

/* ─────────────────────────────────────────────────────────────
   FINAL TERM MODULE
   ───────────────────────────────────────────────────────────── */
f: {
  label:'Final Term Module',
  short:'Final Term',
  desc:'Lessons 1–4 covering Principles of Design, Basic Photography with the Photography Challenge, Basic Videography, and Guitar Lessons for Beginners with the Guitar Workshops and the Live Guitar Performance, then the Final Term Quiz and Exam.',
  doneIcon:'🏆',
  lessons:[

  /* ── F1 ── */
  {
    id:'f1', num:1, title:'Principles of Design', tag:'Final Term · Lesson 1',
    desc:'Nine rules for turning elements into a composition.',
    blocks:[
      {t:'heading', lvl:2, text:'Principles of Design'},

      {t:'text', html:'<p>The <strong>Principles of Design</strong> are the rules and guidelines artists and designers use to organize visual elements into a unified, effective composition. Navigate all 9 principles below.</p>'},

      {t:'deck', gate:'f1-car', xp:85,
       title:'The Nine Principles', kicker:'Card Deck',
       instr:'Swipe through all 9 principles. Use ← → arrow keys, the buttons, or the dots.',
       items:[
         {img:'images/image28.jpg', alt:'Balance', title:'Balance',
          html:'<p>The distribution of visual weight within an artwork. Balance can be <strong>symmetrical</strong> (equal on both sides), <strong>asymmetrical</strong> (different but visually balanced), or <strong>radial</strong> (arranged around a central point). Balance creates a sense of stability and order in a composition.</p>'},
         {img:'images/image29.jpg', alt:'Contrast', title:'Contrast',
          html:'<p>The use of noticeable differences to create visual interest and emphasis — for example, light versus dark, rough versus smooth, or large versus small. Contrast draws the viewer\'s eye and makes certain elements stand out from others.</p>'},
         {img:'images/image30.jpg', alt:'Emphasis', title:'Emphasis',
          html:'<p>The creation of a focal point that attracts the viewer\'s attention first. Artists use size, color, placement, or contrast to highlight important areas. The focal point is what the artwork wants you to see first — the most visually dominant element.</p>'},
         {img:'images/image31.jpg', alt:'Movement', title:'Movement',
          html:'<p>The path the viewer\'s eye follows through an artwork. Artists guide attention using lines, shapes, colors, and repeated elements. Movement makes a composition feel dynamic and alive, leading the viewer on a visual journey through the entire work.</p>'},
         {img:'images/image32.jpg', alt:'Pattern', title:'Pattern',
          html:'<p>The repetition of elements in a predictable arrangement. Patterns create decorative effects and visual consistency. They can be simple (a repeating stripe) or complex (intricate geometric motifs), appearing in nature, textiles, architecture, and fine art.</p>'},
         {img:'images/image33.jpg', alt:'Rhythm', title:'Rhythm',
          html:'<p>The repetition of visual elements that creates a sense of flow or movement. Like rhythm in music, it can be regular (consistent intervals), alternating (switching between two elements), or progressive (gradually changing in size or direction).</p>'},
         {img:'images/image34.jpg', alt:'Unity', title:'Unity',
          html:'<p>The sense that all parts of an artwork belong together and work as a whole. Unity creates harmony and coherence. Without it, an artwork can feel chaotic. Artists achieve unity through consistent use of color, style, shape, or theme throughout the work.</p>'},
         {img:'images/image35.jpg', alt:'Variety', title:'Variety',
          html:'<p>The use of different elements to add interest and prevent monotony. Variety keeps artwork engaging while supporting unity. The challenge is balance — too much variety becomes chaotic; too little becomes boring.</p>'},
         {img:'images/image36.jpg', alt:'Proportion and Scale', title:'Proportion and Scale',
          html:'<p>The relationship of the sizes of parts to each other and to the whole. Proper proportion creates realism, balance, or intentional distortion. Artists manipulate proportion and scale to convey importance, create drama, or guide the viewer\'s eye.</p>'}
       ]},

      {t:'match', gate:'f1-match', xp:70,
       title:'Principle Match', kicker:'Memory Minigame',
       instr:'Pair each <strong>principle</strong> with the idea that defines it. Tap a principle, then tap its match.',
       pairs:[
         {a:'Balance',    b:'Distribution of visual weight'},
         {a:'Contrast',   b:'Noticeable differences that create interest'},
         {a:'Emphasis',   b:'The focal point you see first'},
         {a:'Movement',   b:'The path your eye follows'},
         {a:'Pattern',    b:'Predictable repetition of elements'},
         {a:'Rhythm',     b:'Repetition that creates flow'},
         {a:'Unity',      b:'All parts belong together'},
         {a:'Variety',    b:'Difference that prevents monotony'},
         {a:'Proportion', b:'Size relationships of parts to whole'}
       ]},

      {t:'continue', id:'cont-f1', req:['f1-car'], label:'Continue to Lesson 2',
       note:'⚠️ Navigate through all 9 Principles of Design to continue.', go:'f2', unlock:2}
    ]
  },

  /* ── F2 ── */
  {
    id:'f2', num:2, title:'Basic Photography', tag:'Final Term · Lesson 2',
    desc:'Master the exposure triangle — then prove it in the simulator.',
    blocks:[
      {t:'heading', lvl:2, text:'Basic Photography'},

      {t:'discover', gate:'f2-tabs', xp:50, cols:3,
       title:'The Exposure Triangle', kicker:'Discovery Grid',
       instr:'Three controls decide every photograph. <strong>Uncover all 3</strong> before entering the simulator.',
       items:[
         {label:'Aperture', ico:'🔘', img:'images/image37.jpg', alt:'Aperture', title:'Aperture',
          html:'<p>The opening inside the lens that allows light to enter. Measured in <strong>f-stops</strong> (e.g., f/1.8, f/4, f/11).</p><ul><li><strong>Wider aperture</strong> (smaller f-number, e.g., f/1.8) → More light, shallower depth of field.</li><li><strong>Narrower aperture</strong> (larger f-number, e.g., f/16) → Less light, greater depth of field.</li></ul><p><strong>Depth of Field:</strong> Wide apertures blur the background (portraits); narrow apertures keep the full scene sharp (landscapes).</p>'},
         {label:'Shutter Speed', ico:'⏱️', img:'images/image38.jpg', alt:'Shutter Speed', title:'Shutter Speed',
          html:'<p>The time the camera sensor is exposed to light. Measured in fractions of a second (e.g., 1/1000s, 1/125s, 1").</p><ul><li><strong>Fast shutter</strong> (e.g., 1/1000s) → Freezes motion, less light.</li><li><strong>Slow shutter</strong> (e.g., 1/15s or slower) → Motion blur, more light.</li></ul><p><strong>Use cases:</strong> Sports: 1/1000s+. Waterfalls with silky effect: 1s+.</p>'},
         {label:'ISO', ico:'🌗', img:'images/image39.jpg', alt:'ISO', title:'ISO',
          html:'<p>The camera sensor\'s sensitivity to light. Common values: ISO 100, 200, 400, 800, 1600, 3200, 6400.</p><ul><li><strong>Lower ISO</strong> → Less sensitive, cleaner image, requires more light.</li><li><strong>Higher ISO</strong> → More sensitive, brighter image, may introduce digital noise/grain.</li></ul><p><strong>Use cases:</strong> Bright day: ISO 100. Indoor/low-light: ISO 800–3200+.</p>'}
       ]},

      {t:'heading', lvl:3, text:"Sir Kito's Exposure Triangle Simulator"},

      {t:'sim-exposure', gate:'f2-sim', xp:100, badge:'exposure'},

      {t:'quiz', mode:'single', gate:'f2-kc', xp:55, optional:true,
       title:'Camera Call', kicker:'Knowledge Check',
       q:'You are shooting a fast-moving basketball game indoors and the photos come out dark and blurry. Based on the exposure triangle, which adjustment set makes the most sense?',
       opts:[
         {txt:'Keep ISO 100 for a clean image and accept the blur.'},
         {txt:'Slow the shutter to 1/15s and drop ISO to 100.'},
         {txt:'Use a fast shutter (1/1000s), widen the aperture (low f-number), and raise the ISO.'},
         {txt:'Narrow the aperture to f/22 and keep everything else the same.'}
       ]},

      {t:'heading', lvl:3, text:'Composition: Where to Put Your Subject'},

      {t:'text', html:`
        <p>Good exposure makes a photo readable; good composition makes it worth looking at. Try these on your phone camera:</p>
        <ul>
          <li><strong>Rule of thirds</strong>: turn on the grid and place your subject where the lines cross, not dead center.</li>
          <li><strong>Leading lines</strong>: use roads, rails, fences or shadows to lead the eye to the subject.</li>
          <li><strong>Framing</strong>: shoot through a doorway, window or branches to frame the subject.</li>
          <li><strong>Symmetry and pattern</strong>: center the subject when both sides mirror each other, or fill the frame with a repeating pattern.</li>
          <li><strong>Light and angle</strong>: shoot with soft side light near windows or at golden hour, and try high and low angles instead of only eye level.</li>
        </ul>`},

      {t:'heading', lvl:2, text:'Final Term Activity: Photography Challenge'},

      {t:'text', html:`
        <p>In <strong>Week 13</strong> you put this lesson to work. Sir Kito will give each class a challenge theme. Shoot with any camera or phone, then submit a set of <strong>five original photos</strong>, each with a one-to-two sentence caption. Your best shots go up in the class photo exhibit.</p>
        <p>Your set should show a clear subject, good exposure, and at least three composition techniques from this lesson, such as the rule of thirds, leading lines, framing, symmetry or angle, plus the principles of design from Lesson 1. Each caption should explain the technique and the intent behind the shot. Submit your own original photos only: no AI-generated or heavily filtered images.</p>`},

      {t:'rubric', kicker:"Rubric R4 \u00b7 How it is scored", title:"Final Term Activity: Photography Challenge", when:"Week 13",
       task:"Following the theme given in class, shoot and submit five original photographs, each with a one-to-two sentence caption.",
       crit:[
         {name:"Theme and creativity", pts:20, ex:"Fresh, personal take on the theme; the set tells a clear story or idea."},
         {name:"Exposure and focus", pts:20, ex:"All photos well exposed and sharp where intended; motion and depth handled on purpose."},
         {name:"Composition", pts:25, ex:"Uses at least three composition techniques effectively (thirds, leading lines, framing, symmetry, angle)."},
         {name:"Principles of design", pts:15, ex:"Balance, contrast, emphasis, rhythm or unity clearly strengthen each photo."},
         {name:"Captions", pts:10, ex:"Each caption explains the technique and the intent behind the shot."},
         {name:"Originality and compliance", pts:10, ex:"All photos taken by you for this task; no heavy filters or AI; complete set on time."}
       ]},

      {t:'continue', id:'cont-f2', req:['f2-tabs','f2-sim'], label:'Continue to Lesson 3',
       note:'⚠️ Uncover all 3 exposure controls and achieve a perfect exposure in the simulator to continue.', go:'f3', unlock:3}
    ]
  },

  /* ── F3 ── */
  {
    id:'f3', num:3, title:'Basic Videography', tag:'Final Term · Lesson 3',
    desc:'Twelve shots, six angles — the director\'s vocabulary.',
    blocks:[
      {t:'heading', lvl:2, text:'Basic Videography'},
      {t:'heading', lvl:3, text:'Types of Shot'},

      {t:'discover', gate:'f3-shot', xp:100, cols:4,
       title:'Shot Library', kicker:'Discovery Grid',
       instr:'Twelve shot types to collect. <strong>Tap every tile</strong> to unlock the camera angles below.',
       items:[
         {label:'ELS', ico:'🏔️', img:'images/image40.jpg', alt:'ELS', title:'Extreme Long Shot (ELS)',
          html:'<p>Shows a very wide view of the environment, making the subject appear small. Often used to <strong>establish location and scale</strong>. Also called an Establishing Shot, it contextualizes the story setting before focusing on characters or action.</p>'},
         {label:'LS / WS', ico:'🌄', img:'images/image41.jpg', alt:'LS', title:'Long Shot (LS) / Wide Shot (WS)',
          html:'<p>Shows the entire subject from head to toe along with much of the surrounding environment. <strong>Provides context and setting</strong> while keeping the subject clearly visible. Both the subject and background are prominently displayed.</p>'},
         {label:'Full Shot', ico:'🧍', img:'images/image42.jpg', alt:'Full Shot', title:'Full Shot (FS)',
          html:'<p>Frames the subject\'s entire body while keeping them more <strong>prominent in the frame</strong> than a wide shot. Shows the whole body — head to toe — but with less surrounding background, placing more emphasis on the subject and their physicality.</p>'},
         {label:'Medium', ico:'👔', img:'images/image43.jpg', alt:'Medium', title:'Medium Shot (MS)',
          html:'<p>Frames the subject <strong>from the waist up</strong>. Balances subject and background, ideal for conversations and interactions. One of the most commonly used shots in filmmaking and television — comfortable, natural, and versatile.</p>'},
         {label:'MCU', ico:'🙂', img:'images/image44.jpg', alt:'MCU', title:'Medium Close-Up (MCU)',
          html:'<p>Frames the subject <strong>from the chest or shoulders up</strong>. Allows viewers to observe facial expressions clearly while retaining some body language. Frequently used in news broadcasts and interviews.</p>'},
         {label:'Close-Up', ico:'😮', img:'images/image45.jpg', alt:'Close-Up', title:'Close-Up (CU)',
          html:'<p>Focuses closely on <strong>a person\'s face or a specific object</strong>. Highlights emotions, details, and reactions with great intimacy. Creates an emotional connection between the viewer and the subject, drawing attention to important details.</p>'},
         {label:'ECU', ico:'👁️', img:'images/image46.jpg', alt:'ECU', title:'Extreme Close-Up (ECU)',
          html:'<p>Shows a very small detail such as an eye, hand, or object. Creates <strong>emphasis, drama, or suspense</strong>. Used for maximum impact — to draw the viewer\'s focus to a single, highly specific detail that carries significant meaning or emotion.</p>'},
         {label:'Two Shot', ico:'👥', img:'images/image47.jpg', alt:'Two Shot', title:'Two Shot',
          html:'<p>Frames <strong>two subjects within the same shot</strong>. Commonly used during conversations to show the relationship and dynamic between two characters. Can use various framing sizes (medium, full, etc.) depending on context.</p>'},
         {label:'OTS', ico:'🫱', img:'images/image48.jpg', alt:'OTS', title:'Over-the-Shoulder Shot (OTS)',
          html:'<p>Shows one subject <strong>from behind another person\'s shoulder</strong>. Frequently used in dialogue scenes to establish perspective and spatial relationship between two characters. The foreground shoulder anchors the viewer in space.</p>'},
         {label:'POV', ico:'🥽', img:'images/image49.jpg', alt:'POV', title:'Point-of-View Shot (POV)',
          html:'<p>Presents the scene <strong>from a character\'s perspective</strong>, allowing viewers to see what the character sees. Creates immersion and empathy — it puts the audience directly in the character\'s shoes. Used to show what someone is looking at or to heighten tension.</p>'},
         {label:'Insert', ico:'📱', img:'images/image50.jpg', alt:'Insert', title:'Insert Shot',
          html:'<p>Focuses on <strong>a specific object or detail important to the story</strong> — such as a phone screen, clock, or key. Provides the audience with information necessary to understand the narrative, showing something the character is reading, handling, or looking at closely.</p>'},
         {label:'Cutaway', ico:'✂️', img:'images/image51.jpg', alt:'Cutaway', title:'Cutaway Shot',
          html:'<p>Temporarily <strong>shifts away from the main action</strong> to show a related subject, reaction, or environmental detail. Used to add context, show reactions, compress time, or build tension. A fundamental tool of film editing used to shape pace and meaning.</p>'}
       ]},

      {t:'heading', lvl:3, text:'Camera Angles'},

      {t:'discover', gate:'f3-angle', xp:60, cols:3,
       title:'Angle Library', kicker:'Discovery Grid',
       instr:'Six angles that change everything about how a subject reads on screen.',
       items:[
         {label:'Eye-Level', ico:'😐', img:'images/image52.jpg', alt:'Eye-Level', title:'Eye-Level Angle',
          html:'<p>The camera is positioned at the <strong>subject\'s eye level</strong>. Creates a natural, neutral perspective making the viewer feel equal to the subject. The most common camera angle in everyday filmmaking — it neither elevates nor diminishes the subject.</p>'},
         {label:'High Angle', ico:'🔽', img:'images/image53.jpg', alt:'High Angle', title:'High Angle',
          html:'<p>The camera <strong>looks down on the subject from above</strong>. Can make the subject appear smaller, weaker, vulnerable, or less important. Used to show a character in a powerless situation, depict a crowd scene, or establish the relative scale of a subject in their environment.</p>'},
         {label:'Low Angle', ico:'🔼', img:'images/image54.jpg', alt:'Low Angle', title:'Low Angle',
          html:'<p>The camera <strong>looks up at the subject from below</strong>. Can make the subject appear larger, stronger, more powerful, or intimidating. Used to convey authority, dominance, or heroism. Superhero films frequently use low angles when showing protagonists in action.</p>'},
         {label:"Bird's-Eye", ico:'🦅', img:'images/image55.jpg', alt:"Bird's-Eye", title:"Bird's-Eye View (Aerial Shot)",
          html:'<p>The camera is positioned <strong>directly above the scene, looking straight down</strong>. Provides a unique, disorienting perspective and reveals spatial relationships. Often used in establishing shots, action sequences, or to create a sense of surveillance or omniscience.</p>'},
         {label:"Worm's-Eye", ico:'🐛', img:'images/image56.jpg', alt:"Worm's-Eye", title:"Worm's-Eye View",
          html:'<p>The camera is placed <strong>very low, near the ground, looking upward</strong>. Exaggerates height and creates a dramatic, often unsettling effect. Makes everything above the camera look towering and powerful — used in action, horror, or scenes requiring extreme visual drama.</p>'},
         {label:'Dutch Angle', ico:'🌀', img:'images/image57.jpg', alt:'Dutch Angle', title:'Dutch Angle (Tilted Angle)',
          html:'<p>The camera is <strong>intentionally tilted sideways</strong>. Creates a sense of tension, imbalance, confusion, or unease. Also called the "canted angle" or "oblique angle," the Dutch Angle is a stylistic choice used in thrillers, horror films, and scenes depicting psychological instability.</p>'}
       ]},

      {t:'boss', gate:'f3-boss', xp:130, optional:true,
       title:"Speed Round: The Director's Chair", emoji:'🎬',
       desc:'A scene needs the right shot. Ten seconds per call. Chain correct answers for bonus XP — miss and your combo resets.',
       time:10,
       questions:[
         {q:'You need to establish a vast desert location before the story begins. Which shot?',
          opts:['Extreme Close-Up','Over-the-Shoulder','Insert Shot','Extreme Long Shot']},
         {q:'Two characters are arguing. You want to show the listener\'s perspective. Which shot?',
          opts:['Full Shot','Bird\'s-Eye View','Over-the-Shoulder','Extreme Long Shot']},
         {q:'You want the villain to look powerful and intimidating. Which angle?',
          opts:['Low Angle','Bird\'s-Eye View','High Angle','Eye-Level']},
         {q:'A character reads a threatening text. You must show the phone screen. Which shot?',
          opts:['Long Shot','Two Shot','Medium Shot','Insert Shot']},
         {q:'You want the audience to feel a character is helpless and small. Which angle?',
          opts:['Eye-Level','High Angle','Low Angle','Dutch Angle']},
         {q:'A psychological thriller needs a sense of unease and imbalance. Which angle?',
          opts:['Dutch Angle','High Angle','Worm\'s-Eye View','Eye-Level']},
         {q:'A news anchor delivers the evening report. Which shot is standard?',
          opts:['Extreme Long Shot','Extreme Close-Up','Medium Close-Up','Bird\'s-Eye View']},
         {q:'You cut away from a tense scene to show rain on a window. That is a…',
          opts:['Full Shot','Cutaway Shot','POV Shot','Two Shot']},
         {q:'The audience should see exactly what the character sees. Which shot?',
          opts:['Over-the-Shoulder','Medium Shot','Insert Shot','POV Shot']},
         {q:'A single tear rolls down a cheek — maximum emotional impact. Which shot?',
          opts:['Two Shot','Long Shot','Extreme Close-Up','Full Shot']}
       ]},

      {t:'heading', lvl:3, text:'Planning and Editing a Short Video'},

      {t:'text', html:`
        <p><strong>Storyboard first.</strong> Before you shoot, sketch each scene in a box and write under it the shot type, the camera angle, and what is said or heard. A one-minute video usually needs only six to ten shots.</p>
        <p><strong>Edit simply.</strong> In a free phone editor, put the clips in storyboard order, trim the dead seconds at the start and end of each clip, keep the sound clear and steady, and add titles only where they help the viewer.</p>`},

      {t:'continue', id:'cont-f3', req:['f3-shot','f3-angle'], label:'Continue to Lesson 4',
       note:'⚠️ Collect all 12 shot types and all 6 camera angles to continue.', go:'f4', unlock:4}
    ]
  },

  /* ── F4 ── */
  {
    id:'f4', num:4, title:'Guitar Lessons for Beginners', tag:'Final Term · Lesson 4',
    desc:'Chords, strumming, the guitar workshops, and your live performance.',
    blocks:[
      {t:'heading', lvl:2, text:'Guitar Lessons for Beginners'},
      {t:'heading', lvl:3, text:"Sir Kito's Interactive Guitar Chord Cheat Sheet"},

      {t:'sim-guitar', gate:'f4-chords', xp:80, badge:'guitarist'},

      {t:'heading', lvl:3, text:'Strumming Patterns'},

      {t:'text', html:`
        <p><strong>D</strong> = Downstroke &nbsp;&nbsp;|&nbsp;&nbsp; <strong>U</strong> = Upstroke</p>
        <p style="margin-top:14px"><strong>Whole Note</strong> (4 beats): <span style="font-family:monospace">D (sustained to 4 beats)</span></p>
        <p><strong>Half Note</strong> (2 beats): <span style="font-family:monospace">D – D (each sustained to 2 beats)</span></p>
        <p><strong>Quarter Note</strong> (1 beat): <span style="font-family:monospace">D – D – D – D</span></p>
        <p><strong>Eighth Note</strong> (½ beat): <span style="font-family:monospace">DU – DU – DU – DU</span></p>
        <p><strong>Sixteenth Note</strong> (¼ beat): <span style="font-family:monospace">DUDU – DUDU – DUDU – DUDU</span></p>
        <p style="margin-top:12px;color:var(--muted);font-style:italic">Same principles apply to rests — pauses in which you don't make a sound.</p>`},

      {t:'strum', title:'Strum Trainer', kicker:'Rhythm Player',
       instr:'Pick a pattern and hit play. Watch the beat light up so you can feel the timing before you pick up the guitar.'},

      {t:'quiz', mode:'single', gate:'f4-kc', xp:60,
       title:'Count the Beats', kicker:'Knowledge Check',
       q:'Which pattern most likely contains a <strong>half note</strong>?',
       mono:true,
       opts:[
         {txt:'D – DU – DU – D'},
         {txt:'D – DUDU – D – D'},
         {txt:'D – D – DUDU – D'},
         {txt:'DUDU – DUDU – D'},
         {txt:'D – D – D – D'},
         {txt:'D (sustained to 4 beats)'}
       ]},

      {t:'heading', lvl:3, text:'Guitar Lesson Classroom Workshops'},

      {t:'text', html:'<p>In <strong>Week 16</strong> we hold two hands-on workshop meetings in class. Bring a guitar if you have one (sharing is fine). We will practice tuning, clean chord changes and steady strumming with the patterns above, and Sir Kito will check your progress at each meeting.</p>'},

      {t:'rubric', kicker:"Rubric R5 \u00b7 How it is scored", title:"Guitar Lesson Classroom Workshops", when:"Week 16 · two meetings",
       task:"Show tuning and posture, the assigned open chords, clean chord changes and the strumming patterns from this lesson. Each meeting is rated and the two scores are averaged.",
       crit:[
         {name:"Tuning and posture", pts:20, ex:"Tunes the guitar independently; relaxed, correct posture and hand position."},
         {name:"Chord accuracy", pts:30, ex:"All assigned chords ring clearly with no muted or buzzing strings."},
         {name:"Chord transitions", pts:25, ex:"Changes chords on the beat without stopping."},
         {name:"Strumming and rhythm", pts:25, ex:"Keeps a steady tempo with the assigned pattern, down and up strokes correct."}
       ],
       note:"No guitar? You may share one. Borrowing does not lower your score."},

      {t:'heading', lvl:3, text:'Final Term Project: Live Guitar Performance'},

      {t:'text', html:'<p>In <strong>Week 17</strong> you perform a short song live in class, about <strong>1–2 minutes</strong> long, using at least <strong>three chords</strong> and one strumming pattern from this lesson. Singing is optional. Sir Kito will give the performance schedule in class.</p>'},

      {t:'rubric', kicker:"Rubric R6 \u00b7 How it is scored", title:"Final Term Project: Live Guitar Performance", when:"Week 17 · in class",
       task:"Perform a short song live in class, about 1–2 minutes long, using at least three chords and one strumming pattern from this lesson. Singing is optional and is not scored separately.",
       crit:[
         {name:"Chord accuracy", pts:25, ex:"Every chord clean and correct throughout the song."},
         {name:"Rhythm and tempo", pts:25, ex:"Steady tempo and a strumming pattern that fits the song from start to end."},
         {name:"Transitions and fluency", pts:20, ex:"Plays through without stopping; smooth chord changes."},
         {name:"Musicality and expression", pts:15, ex:"Dynamics and feel suit the song; clear musical intent."},
         {name:"Preparation and stage presence", pts:15, ex:"Tuned and ready on time; introduces the song; confident and respectful on stage."}
       ],
       note:"If you are ill on performance day, you may perform at a make-up session with a valid excuse."},

      {t:'heading', lvl:3, text:'Final Term Quiz and Final Term Exam'},

      {t:'text', html:'<p>The <strong>Final Term Quiz</strong> (Week 17) and the <strong>Final Term Exam</strong> (Week 18) cover Lessons 1 to 4 of the Final Term. Both are taken here in the module, under <strong>Tests</strong>.</p>'},

      {t:'continue', id:'cont-f4', req:['f4-kc'], label:'Complete Final Term Module 🎉',
       note:'⚠️ Answer the knowledge check above to complete this module.', go:'fc'}
    ]
  }
  ],

  complete:{
    id:'fc', icon:'🏆', title:'Final Term Module Complete!', conf:'🎸 ✨ 📸 🎬 ✨ 🎸',
    badge:'final',
    html:"Congratulations! You've successfully completed the <strong>Final Term Learning Module</strong> for AAP101. You've mastered the Principles of Design, the fundamentals of Photography and Videography, and explored Guitar Basics. Good luck with your Live Guitar Performance!"
  }
}
};

/* ─────────── Terminal / home page content ─────────── */
const TERMINAL = {
  heroTag:'Bulacan State University · Main Campus',
  heroTitle:'Art Appreciation',
  heroSub:'AAP101 · '+AAP_TERM+'<br>Instructor: Mr. Benedict C. de Jesus, LPT. <span style="white-space:nowrap">(Sir Kito)</span>',
  video:{src:'images/video1.mp4', label:'Welcome to AAP101'},
  welcome:'<p>Welcome to <strong>AAP101 – Art Appreciation</strong> under Mr. Benedict de Jesus (Sir Kito)!</p>',
  warnTitle:'⚠️ &nbsp;WARNING!!!',
  warn:'This learning module was created by <strong>Mr. Benedict de Jesus (Sir Kito)</strong> for his students at <strong>Bulacan State University</strong> for the '+AAP_TERM+'. Distribution and sharing of the link/url/screenshots/codes to people <strong>not enrolled in AAP101 under Sir Kito during the aforementioned semester is extremely prohibited</strong> and violators will <strong>face legal charges</strong>. Enrolled students, while given access rights to the course, are <strong>discouraged to take screenshots</strong>, as the interactive elements for learning the topic will be compromised.'
};
