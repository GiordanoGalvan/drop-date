# -*- coding: utf-8 -*-
import io

p = 'index.html'
h = io.open(p, encoding='utf-8').read()


def sub(old, new, n=1):
    global h
    assert h.count(old) == n, (h.count(old), n, old[:110])
    h = h.replace(old, new)


# ---- via gli strati dal markup ----
sub('''<div class="bgart" id="bgart" aria-hidden="true"></div>
<div class="bgvelo" aria-hidden="true"></div>
<div class="bar">''', '''<div class="bar">''')

# ---- via il CSS degli strati ----
i0 = h.index('''/* Gli strati partono dal bordo della pagina e passano anche sotto la barra''')
i1 = h.index('''/* Il contenuto sta sopra i due strati''')
h = h[:i0] + h[i1:]
sub('''/* Il contenuto sta sopra i due strati, altrimenti la sfocatura gli finirebbe
   davanti e nessun velo basterebbe. */
.wrap{z-index:1}
.mhead,.main,.sec,.foot{position:relative;z-index:1}
''', '')

# ---- la barra torna opaca ----
sub('''/* Traslucida con sfocatura dietro: in cima lascia vedere l'immagine, e appena il
   calendario le scorre sotto lo appanna invece di coprirlo di netto. Dove
   backdrop-filter non c'e' resta il fondo al 72%, che tiene il testo leggibile:
   misurato sul caso peggiore, 4,86 per l'etichetta piu' debole. */
.bar{position:sticky;top:env(safe-area-inset-top,0px);z-index:30;
  background:rgba(var(--bg-rgb),.72);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);
  border-bottom:1px solid var(--line)}''',
    '''.bar{position:sticky;top:env(safe-area-inset-top,0px);z-index:30;background:var(--bg);
  border-bottom:1px solid var(--line)}''')

# ---- via la funzione che sceglieva la copertina ----
i2 = h.index('''/* Lo sfondo e' la copertina del titolo piu' atteso''')
i3 = h.index('''Promise.all([grab("data.json"),grab("history.json")]).then(function(res){''')
h = h[:i2] + h[i3:]
sub('''  sfondoDiPunta();
  apriOggi();''', '''  apriOggi();''')

# ---- il commento su .wrap non ha piu' oggetto, ma position:relative resta utile ----
sub('''/* Lo sfondo e' la copertina del titolo piu' atteso, sfocata sotto un velo. Sta
   dentro .wrap e non fisso a schermo, cosi' scorre con la pagina e non combatte
   con la barra, che e' sticky e opaca. Il velo arriva al fondo pieno: senza quello
   il testo sopra l'immagine perderebbe contrasto proprio dove serve. */
.wrap{position:relative;''', '''.wrap{position:relative;''')

sub('''html,body{margin:0}
body{position:relative}''', '''html,body{margin:0}''')

# ---- la griglia non ha piu' bisogno del fondo pieno contro l'immagine,
#      ma tenerlo non costa e protegge da qualunque sfondo futuro ----
sub('''/* Fondo pieno e non trasparente: la griglia e' l'unico posto della pagina con
   testo a dodici pixel, e l'immagine non deve passarci sotto. */
.cell{position:relative;''',
    '''/* Fondo pieno: la griglia e' l'unico posto della pagina con testo a dodici
   pixel, e nessuno sfondo deve passarci sotto. */
.cell{position:relative;''')

io.open(p, 'w', encoding='utf-8', newline='\n').write(h)
print('sfondo rimosso')
