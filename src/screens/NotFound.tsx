import { Button, Screen } from '../components/ui'

/**
 * A wrong turn.
 *
 * Unknown paths used to render the home screen, which quietly told the player
 * their link had worked. Saying so plainly is kinder, and it stops a typo in a
 * shared URL looking like the game losing their draft.
 */
export default function NotFound() {
  return (
    <Screen>
      <div className="grid min-h-[60vh] place-items-center text-center">
        <div className="max-w-[320px]">
          <div className="display text-[46px] leading-none text-gold">404</div>
          <h1 className="display mt-3 text-[19px]">Played and missed</h1>
          <p className="mt-2 text-[12.5px] leading-relaxed text-moss">
            There is nothing at this address. The link may be old, or a character short.
          </p>
          <div className="mx-auto mt-5 max-w-[220px]">
            <Button to="/" full>
              Back to the pavilion
            </Button>
          </div>
        </div>
      </div>
    </Screen>
  )
}
