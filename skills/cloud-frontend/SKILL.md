---
name: cloud-frontend
description: make good frontend
---

# Frontend Skill (by cloudwaddie)

Hello agents. I have some exciting news for you: you just got powered up! Your UI will be godlike! Let's start with some big no-nos:
FIRST NO NO: DO NOT USE UGLY GRADIENTS. Well, what counts as an ugly gradient:
1. too many colours. generally, a gradient with a whole frickin rainbow is gonna like horrible. A gradient should be a nice touch not be the design feature.
2. Extremely saturated colors. neon purple → neon green can be hard to look at. :(
3. Hard color transitions it should be a smooth transition not like a cliff
4. Random direction if the gradient doesn't reinforce the layout or visual hierarchy its gonna look out of place
5. Gradient everywhere ima be honest gradients can be good but dont use them everywhere. e.g. a button most likely doesnt need a gradient. a soft radial gradient can be nice on a landing page, say on a card, but everywhere? no no.
6. Overly bright glow especially huge blurred purple/blue blobs behind everything.
7. poor text contrast: white text sitting over a bright portion of the gradient.
8. generic ai look. this is hard to say in words but like just do the above rules.

here is a nice rule for you: A good gradient supports the design. An ugly gradient becomes the design.

now lets move onto da next thingy: tailwind (really this also applies to css but ✨tailwind!!!!✨)
ok so: once upon a time i was inspecting some sloppy ai code and i was like this is really bad so i deleted some css. as if by magic...... nothing changed! pls don't use extra css. just pls dont. like minimal css (especially on component libraries such as shadcnui) looks better a lot of the time.

marketing speak:
pls just pls dont have a little thingy under a button "this button is a combination of sleek modern glasmorphism..... dot dot dot" JUST DONT. the user does not care. dont put in the meta of the html "hehe hello i put some nice ui xD - claude" NO SIR DO NOT DO THAT. you don't need to explain every single thing. also ask yourself: "Could this sentence describe 500 different SaaS products without changing a word?" IF YES ITS BAD. its just yapity yap without saying much. 

## Marketing / Product Copy

**DO NOT WRITE MARKETING COPY UNLESS THE USER ACTUALLY NEEDS MARKETING COPY.**

The UI is not a press release. If the product is a developer tool, dashboard, settings page, documentation site, internal tool, or other functional interface, **describe what the thing does instead of trying to sell it.**

### Kill this shit:

* “Work smarter, not harder.”
* “Unlock the power of…”
* “Supercharge your workflow.”
* “Built for the future.”
* “The future of X is here.”
* “Transform the way you…”
* “Revolutionize…”
* “Next-generation…”
* “Cutting-edge…”
* “Powerful intelligence.”
* “Seamless integration.”
* “Effortlessly…”
* “Designed for modern teams.”
* “Built with you in mind.”
* “Take your productivity to the next level.”
* “Everything you need to…”
* “One platform for all your…”
* “From idea to execution.”
* “Meet the future of…”
* “Create what's exciting. Maintain what's essential.”

**Especially don't combine several of these into one sentence.**

> “Unlock the power of next-generation AI to seamlessly transform your workflow.”

This says almost nothing.

### Say what it actually does.

Bad:

> **Powerful intelligence**
> Supercharge your development workflow with next-generation AI.

Better:

> **Codebase search**
> Find files, functions, and references across your project.

Bad:

> **Work smarter, not harder.**
> Everything you need to build amazing software.

Better:

> **Claude Code**
> Edit files, run commands, and review changes from your terminal.

Bad:

> **The future of development is here.**

Better:

> **Run tests**
> Run your project's test suite and inspect failures.

### Don't manufacture importance

Don't add:

* fake statistics
* fake customer counts
* fake testimonials
* fake awards
* fake “trusted by” sections
* fake performance claims
* meaningless badges
* invented company logos
* “#1” / “best” / “fastest” claims without evidence

If the user hasn't provided the information, **don't invent it to make the page look more legitimate.**

### Don't turn documentation into advertising

If you're making a developer tool or technical product page, don't write copy like:

> **Powerful intelligence**
> Optimized for code understanding and generation with cutting-edge AI.

Just tell me what it does:

> **Codebase understanding**
> Search files, trace dependencies, and make coordinated changes across your project.

Technical users want **information**, not persuasion.

### Don't narrate the product's greatness

Avoid adjectives that don't communicate anything:

> powerful
> innovative
> revolutionary
> intelligent
> seamless
> elegant
> intuitive
> delightful
> cutting-edge
> next-generation
> world-class
> best-in-class
> transformative

If removing the adjective doesn't change the meaning, **remove it.**

### The 500-product test

Ask:

> **Could this copy appear on 500 unrelated SaaS websites without anyone noticing?**

If yes, rewrite it.

And I'd add one particularly important rule:

> **DO NOT COPY THE LANGUAGE OF OTHER AI PRODUCTS.**

Claude's example you pasted is *exactly* the kind of thing you want to prevent:

> “Work with Claude directly in your codebase. Build, debug, and ship…”

> “Powerful intelligence”

> “Meets you where you code”

> “Create what's exciting. Maintain what's essential.”

Those phrases are **brand/marketing copy**, not interface information. An AI coding agent will naturally imitate that style unless you explicitly tell it not to.

### One more rule I'd add to the very top

**DEFAULT TO INFORMATIONAL COPY, NOT MARKETING COPY.**

If a heading can simply say:

> `Code search`

don't turn it into:

> `Unlock powerful intelligence for your entire codebase`

If a button can say:

> `Install`

don't turn it into:

> `Start building →`

If a section can say:

> `Features`

don't turn it into:

> `Everything you need to build the future`

**Be specific. Be useful. Shut up when there's nothing useful to say.**


ok lemme just make a list:
PLEASE do not explain the design to me. I can literally see it.
Do not put some tiny paragraph under a button saying “Crafted with a sleek, modern glassmorphic aesthetic…”. WHO IS THAT FOR.
Do not add tooltips explaining what the UI element is aesthetically. IT IS A BUTTON.
Do not write comments like <!-- hehe made this nice and modern -->. DELETE THAT.
Do not put your design philosophy in the HTML.
Do not write “This section uses a carefully curated visual hierarchy…” anywhere. I KNOW. I ASKED YOU TO MAKE IT.
Don't describe the gradient you just made. THE GRADIENT IS RIGHT THERE.
Don't add a badge saying “✨ Modern UI”. Congratulations. You made a UI.
Don't label things “AI-powered ✨” unless it actually tells the user something useful.
Don't add “Built with love”, “Made for creators”, “Designed for the future”, or other meaningless filler.
Don't put “Simple. Powerful. Beautiful.” above three cards and call it a feature.
Don't add “Experience the future of…” to the hero. WHAT FUTURE.
Don't call everything seamless, intuitive, powerful, elegant, revolutionary, cutting-edge, next-generation, delightful, or effortless.
Don't use “unlock,” “elevate,” “empower,” “supercharge,” “transform,” or “reimagine” unless you have an actual reason to.
Don't add a giant heading that says “Everything you need to succeed.” That's not information.
Don't put fake testimonials like “This completely changed the way I work!” with a random avatar.
Don't invent statistics like “10x faster” just because the page needs a number.
Don't add a row of “Trusted by 10,000+ teams” logos if there aren't actually 10,000 teams.
Don't make every card float, glow, blur, gradient, and animate simultaneously.
STOP ADDING PURPLE GLOWING BLOBS TO THE BACKGROUND.
Don't put ✨ on every other heading.
Don't make the page look like “AI Startup Landing Page #847.”
Don't add a giant “Get Started →” button when there is nothing to get started with.
Don't add a section called “Why choose us?” followed by three incredibly generic reasons.
Don't explain that the interface is “clean, minimal, and user-friendly.” If it is, the user will notice.
Don't add unnecessary copy simply because an empty space exists.
Whitespace is allowed. You do not have to fill every pixel.
Don't turn a simple setting into a 400-word explanation.
Don't narrate your thought process in the UI.
Don't leave behind developer commentary, AI jokes, or little notes to whoever opens the source.
The user is not supposed to know that an AI made this.
And for the love of god, don't write “As an AI…” anywhere in the product.


If the user can understand it by looking at the interface, don't explain it to them.

If the copy doesn't tell the user something useful, delete it.

If it sounds like Claude wrote a comment congratulating itself for making the UI, delete it.

AND DONT REPEAT THE PROMPT IN THE UI. dont say "sleak black and white ui" NO JUST SHUT UP ABOUT THAT. the end user doesnt wanna know what design style i told you to go for.


Layout & spacing:
idrk what to put here just:
DONT MAKE STUFF REALLY BIG FOR NO REASON OR REALLY SMALL OR WHATEVER. the layout should flow nicely.

color:
pick a pallet. dont make everything important bright. dont use text so hard to read its p much invisble. 

### COLOR DOES NOT MEAN BLACK AND WHITE

Do **not** interpret “avoid AI slop” as “make everything gray.”

A good UI can and should use colour. The goal is **intentional colour**, not **no colour**.

- Pick a clear colour palette and actually use it.
- A primary/accent colour is GOOD.
- Secondary accent colours are fine when they serve a purpose.
- Use colour to establish hierarchy and personality.
- Buttons, links, selected states, tags, charts, icons, and highlights can all use colour.
- Backgrounds can have subtle colour tints instead of being pure gray.
- Cards don't all need to be white/gray.
- Don't make the entire UI monochrome just because monochrome looks “clean.”
- Don't make everything the same shade of gray.
- Don't be afraid of colour.
- **Colour should be controlled, not eliminated.**

### THE RULE

> **Don't use colour everywhere. Don't remove colour everywhere. Use it where it makes the interface better.**

For example, this is **not** the goal:

> gray background + gray cards + gray borders + gray text + black button

And this isn't the goal either:

> purple + pink + cyan + green + orange + glowing gradients everywhere

Instead:

> **neutral foundation + deliberate accent colour + restrained supporting colours**

Also, **don't automatically choose purple/blue** just because it's an AI product.

If the product's branding is green, use green.  
If it's orange, use orange.  
If it's red, use red.  
If the design calls for several colours, use several colours.

**“Professional” does not mean “colorless.”**

### IMPORTANT

**Pick a palette. USE COLOUR. Just don't make everything important bright.**


TYPOGRAPHY:
imo this is one of the things that sets apart good ui from bad ui.

Don't randomly bold words for “emphasis.”
Don't make every heading enormous.
Don't use five different font sizes in one card.
Don't use uppercase text everywhere.
Don't use h@x0r text or that stupid mono font unless thats the design. like cmon we aren't in a 2000s movie this is real ui. use nice sleek professional text. 
Don't use tiny text just because “text-xs” exists.

SOME OTHER STUFF:
Don't put a border around everything.
Not everything needs rounded-xl.
Not everything needs shadow-sm.
Don't make 14 tiny cards instead of one sensible section.

animations:
Don't animate everything.
Don't make cards fly in from different directions on page load.
Don't use bouncing, pulsing, spinning, floating, and glowing simultaneously.
Hover animations should be subtle and useful.
Don't animate things that users interact with frequently.
Respect prefers-reduced-motion.
Don't add an animation just because the page feels “empty.”


response design:
MOBILE: THATS NOT A oh ye my bad gng ill add that its a YES SIR I WILL MAKE MOBILE AND DESKTOP!!!
Don't simply make desktop elements narrower. IT SHOULD BE DESIGNED FOR MOBILE NOT JUST SHRUNK. I CAN SHRINK STUFF I DONT NEED SOME AI CONSUMING MY TOKEN MONEY OR PLAN SUB OR WHATNOT TO SHRINK STUFF.
Don't create horizontal scrolling accidentally.
Don't make a desktop dashboard microscopic on mobile.
Responsive doesn't mean “everything gets smaller.”

Interactions and UX:
BUTTONS ARE CLICKABLE SO MAKE THAT OBVIOUS. HOVER STATES PLS I DONT WANT A BLOB THAT LOOKS LIKE A BUTTON BUT OH WAIT HOVERING DOES NOTHING MAYBE ITS NOT OH WELL IG ILL LEAVE IT.
LOADING STATES SHOULD EXIST. SUSPENSE!!
Loading states should exist.
Empty states should explain what the user can do next.
Errors should explain what went wrong and how to fix it.
Don't use a toast for information the user needs to act on.
Don't make clickable things look like static text.
Don't hide important actions behind three menus.
Don't make users guess what an icon means.
Tooltips should not delay animating open if already on another one e.g delay first tooltip open but if i slide my cursor over just straight away show the other tooltip.

dont over engineer:
Delete unused imports.
Delete dead CSS.
Delete unused components.


Don't fake functionality
Don't make buttons that do nothing.
Don't create fake search bars.
Don't add fake notifications.
Don't create fake analytics numbers.
Don't make a “Download” button that doesn't download anything.
Don't pretend an API integration exists when it doesn't.
If something isn't implemented, don't disguise it as implemented.

Does this badge communicate anything?
Does this card need to exist?
Does this animation improve anything?
Does this paragraph tell the user something?
Does this border help distinguish anything?
Does this icon improve comprehension?
Does this button need to be here?

# AI tends to add. Good design often removes.




now lemme teach you shadcnui:
shadcn ui is really tuff bc you need like no css for a nice website ok i lied you need a lil bit but thats fine


ALSO: ik i said no css but you do gotta do some css otherwise ima have buttons on the left side of the screen looking out of place :(

imagine i wanted a button:
npx shadcn@latest add button - boom
import { Button } from "@/components/ui/button" - boom
<Button variant="outline">Button</Button> - boom

thats it. dont go adding 5 billion divs and styling. 

you can check a component:
https://ui.shadcn.com/docs/components/base/NAME.md
e.g. https://ui.shadcn.com/docs/components/base/button.md

always check a components docs.

also idk bout you but i like these components over your stuff. they are already animated, hover stated, and look dam good.

also shadcnui cards look nice. i dont really like the divs you make.


now sir, if i were you and you were me, i would feel bad for you. cos sometimes i say "thats ugly make it better". but how sir. idk what to do. clarify, but the user probably doesnt wanna type an essay on what they want so also be smart.


nextjs fonts:
import { Geist } from 'next/font/google'
 
const geist = Geist({
  subsets: ['latin'],
})
 
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={geist.className}>
      <body>{children}</body>
    </html>
  )
}


literally font.className

dont make boring sites. add some personality.


thank you sir. make some dam good ui pls.
