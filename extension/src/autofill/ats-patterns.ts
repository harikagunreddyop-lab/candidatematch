export interface FieldPatterns {
  names: string[];
  labels: string[];
  placeholders: string[];
  types?: string[];
  ariaLabels?: string[];
  dataAttrs?: string[]; // data-* attribute values to match
  parentClasses?: string[]; // parent container class hints
  autocomplete?: string[]; // HTML autocomplete attribute values
}

export type ProfileKey =
  | 'firstName' | 'lastName' | 'fullName'
  | 'email' | 'phone'
  | 'location' | 'city' | 'state' | 'zipCode' | 'country'
  | 'currentTitle' | 'currentCompany' | 'yearsExperience'
  | 'linkedinUrl' | 'githubUrl' | 'portfolioUrl'
  | 'summary' | 'defaultPitch' | 'skills'
  | 'degree' | 'school' | 'major' | 'graduationDate'
  | 'visaStatus' | 'authorizedToWork' | 'requiresSponsorship'
  | 'salaryMin' | 'salaryMax' | 'salaryExpectation'
  | 'availability' | 'openToRemote' | 'openToRelocate'
  | 'gender' | 'ethnicity' | 'veteranStatus' | 'disabilityStatus'
  | 'address1' | 'address2';

export const FIELD_PATTERNS: Record<ProfileKey, FieldPatterns> = {
  firstName: {
    names: [
      'first_name', 'firstname', 'fname', 'given_name', 'givenname', 'first-name',
      'applicant_first_name', 'candidate_first_name', 'legalFirstName', 'legal_first_name',
      'preferredFirstName', 'preferred_first_name', 'firstName', 'applicantFirstName',
      'candidate.firstName', 'form-first-name', 'input-first-name',
    ],
    labels: [
      'first name', 'given name', 'first', 'prénom', 'vorname', 'nombre', 'nombre de pila',
      'legal first name', 'preferred first name', 'applicant first name',
    ],
    placeholders: ['first name', 'given name', 'first', 'your first name', 'legal first name'],
    autocomplete: ['given-name'],
  },
  lastName: {
    names: [
      'last_name', 'lastname', 'lname', 'surname', 'family_name', 'familyname', 'last-name',
      'applicant_last_name', 'candidate_last_name', 'legalLastName', 'legal_last_name',
      'lastName', 'familyName', 'form-last-name', 'input-last-name',
    ],
    labels: [
      'last name', 'surname', 'family name', 'nom de famille', 'nachname', 'apellido',
      'legal last name', 'applicant last name',
    ],
    placeholders: ['last name', 'surname', 'family name', 'your last name'],
    autocomplete: ['family-name'],
  },
  fullName: {
    names: [
      'full_name', 'fullname', 'name', 'candidate_name', 'applicant_name', 'your_name',
      'display_name', 'legal_name', 'legalName', 'fullName', 'legal-name', 'full-name',
    ],
    labels: [
      'full name', 'name', 'your name', 'legal name', 'full legal name', 'candidate name',
      'applicant name', 'nombre completo',
    ],
    placeholders: ['full name', 'your name', 'enter your name', 'legal name', 'full legal name'],
    autocomplete: ['name'],
  },
  email: {
    names: [
      'email', 'email_address', 'emailaddress', 'e-mail', 'candidate_email', 'applicant_email',
      'emailAddress', 'primary_email', 'contact_email', 'work_email', 'personal_email',
    ],
    labels: ['email', 'e-mail', 'email address', 'correo', 'courriel', 'email id'],
    placeholders: ['email', 'your email', 'email address', 'enter email', 'work email'],
    types: ['email'],
    autocomplete: ['email'],
  },
  phone: {
    names: [
      'phone', 'telephone', 'tel', 'phone_number', 'phonenumber', 'mobile', 'cell',
      'cell_phone', 'candidate_phone', 'phoneNumber', 'mobilePhone', 'mobile_phone',
      'primary_phone', 'contact_number', 'phone-number', 'mobile-number',
    ],
    labels: [
      'phone', 'telephone', 'mobile', 'phone number', 'cell', 'contact number',
      'mobile number', 'phone no', 'teléfono', 'téléphone',
    ],
    placeholders: ['phone', 'phone number', '(xxx) xxx-xxxx', 'mobile', 'contact number'],
    types: ['tel'],
    autocomplete: ['tel'],
  },
  location: {
    names: [
      'location', 'current_location', 'candidate_location', 'present_location',
      'currentLocation', 'residentialLocation', 'home_location',
    ],
    labels: [
      'location', 'current location', 'where are you based', 'where are you located',
      'residential location', 'home location', 'ubicación',
    ],
    placeholders: ['city, state', 'location', 'where are you located', 'city or zip'],
  },
  city: {
    names: [
      'city', 'city_name', 'applicant_city', 'candidate_city', 'hometown',
      'current_city', 'cityName', 'address_city', 'res_city',
    ],
    labels: ['city', 'ciudad', 'ville', 'town', 'city name'],
    placeholders: ['city', 'your city', 'enter city'],
    autocomplete: ['address-level2'],
  },
  state: {
    names: [
      'state', 'province', 'region', 'state_province', 'stateProvince', 'applicant_state',
      'address_state', 'res_state',
    ],
    labels: ['state', 'province', 'region', 'state/province'],
    placeholders: ['state', 'province', 'state or province'],
    autocomplete: ['address-level1'],
  },
  zipCode: {
    names: [
      'zip', 'zip_code', 'zipcode', 'postal_code', 'postalcode', 'postcode',
      'postal', 'zipCode', 'zip-code', 'postal-code',
    ],
    labels: ['zip', 'zip code', 'postal code', 'postcode', 'código postal'],
    placeholders: ['zip', 'zip code', 'postal code', '12345'],
    autocomplete: ['postal-code'],
  },
  country: {
    names: [
      'country', 'country_name', 'nation', 'countryName', 'applicant_country',
      'country_of_residence', 'residence_country',
    ],
    labels: ['country', 'nation', 'country of residence', 'país', 'pays'],
    placeholders: ['country', 'select country'],
    autocomplete: ['country-name'],
  },
  address1: {
    names: [
      'address', 'address1', 'address_line1', 'addressLine1', 'street', 'street_address',
      'streetAddress', 'address_line_1', 'res_address', 'applicant_address',
    ],
    labels: ['address', 'street address', 'address line 1', 'dirección'],
    placeholders: ['address', 'street address', '123 main st'],
    autocomplete: ['address-line1'],
  },
  address2: {
    names: ['address2', 'address_line2', 'addressLine2', 'apt', 'apartment', 'suite', 'unit'],
    labels: ['address line 2', 'apt', 'suite', 'unit', 'apartment'],
    placeholders: ['apt', 'suite', 'unit', 'address line 2'],
    autocomplete: ['address-line2'],
  },
  currentTitle: {
    names: [
      'current_title', 'title', 'job_title', 'current_job_title', 'position',
      'headline', 'current_role', 'currentTitle', 'jobTitle', 'current_position',
      'job-title', 'role', 'professional_title',
    ],
    labels: [
      'current title', 'job title', 'current position', 'title', 'headline',
      'current role', 'professional title', 'your title', 'position',
    ],
    placeholders: ['current title', 'job title', 'your title', 'current role', 'position'],
  },
  currentCompany: {
    names: [
      'current_company', 'company', 'current_employer', 'employer', 'company_name',
      'organization', 'currentCompany', 'companyName', 'employer_name', 'org_name',
      'present_company', 'current-company',
    ],
    labels: [
      'current company', 'company', 'current employer', 'employer', 'organization',
      'company name', 'current organization', 'employer name',
    ],
    placeholders: ['current company', 'company name', 'employer', 'organization'],
  },
  yearsExperience: {
    names: [
      'years_experience', 'experience', 'years_of_experience', 'total_experience',
      'experience_years', 'yearsExperience', 'total_years', 'yoe', 'years_exp',
    ],
    labels: [
      'years of experience', 'total experience', 'how many years', 'experience',
      'years experience', 'yoe', 'professional experience',
    ],
    placeholders: ['years of experience', 'years', 'experience', 'yoe'],
  },
  linkedinUrl: {
    names: [
      'linkedin', 'linkedin_url', 'linkedinurl', 'linkedin_profile', 'linkedin_profile_url',
      'linkedinUrl', 'linkedin-url', 'linkedin_link', 'li_url',
    ],
    labels: ['linkedin', 'linkedin url', 'linkedin profile', 'linkedin profile url'],
    placeholders: ['linkedin', 'linkedin.com/in/', 'linkedin url', 'linkedin profile url'],
  },
  githubUrl: {
    names: [
      'github', 'github_url', 'githuburl', 'github_profile', 'github_username',
      'githubUrl', 'github-url', 'github_link',
    ],
    labels: ['github', 'github url', 'github profile', 'github username'],
    placeholders: ['github', 'github.com/', 'github url', 'github profile'],
  },
  portfolioUrl: {
    names: [
      'portfolio', 'website', 'portfolio_url', 'personal_website', 'website_url',
      'homepage', 'portfolioUrl', 'personal_url', 'personal-website', 'portfolio-url',
      'personal_site',
    ],
    labels: [
      'portfolio', 'website', 'personal website', 'portfolio url', 'personal site',
      'personal url', 'website url',
    ],
    placeholders: ['portfolio', 'website url', 'your website', 'https://', 'portfolio url'],
  },
  summary: {
    names: [
      'summary', 'about', 'bio', 'about_me', 'professional_summary', 'career_summary',
      'overview', 'background', 'candidate_summary', 'self_description',
    ],
    labels: [
      'summary', 'about you', 'about me', 'professional summary', 'career summary',
      'tell us about yourself', 'background', 'overview', 'professional background',
    ],
    placeholders: [
      'tell us about yourself', 'summary', 'about you', 'professional summary',
      'career summary', 'brief summary', 'write a summary',
    ],
  },
  defaultPitch: {
    names: [
      'cover_letter', 'coverletter', 'cover_letter_text', 'message', 'pitch',
      'additional_information', 'additionalInfo', 'motivation', 'why_interested',
      'cover-letter', 'message_to_hiring_manager', 'additional_comments',
    ],
    labels: [
      'cover letter', 'message', 'why are you interested', 'motivation',
      'additional information', 'message to hiring manager', 'cover note',
      'personal statement', 'tell us why', 'why this role', 'additional comments',
    ],
    placeholders: [
      'cover letter', 'why are you interested', 'write a cover letter',
      'tell us why you want this role', 'additional information',
      'message to hiring manager',
    ],
  },
  skills: {
    names: [
      'skills', 'key_skills', 'technical_skills', 'competencies', 'skill_set',
      'skillset', 'skills_summary', 'core_skills', 'technologies',
    ],
    labels: [
      'skills', 'key skills', 'technical skills', 'competencies', 'skill set',
      'core skills', 'technologies', 'areas of expertise',
    ],
    placeholders: ['skills', 'enter skills', 'list your skills', 'technical skills'],
  },
  degree: {
    names: [
      'degree', 'education_level', 'highest_degree', 'qualification', 'degree_type',
      'highest_education', 'academic_degree', 'educationLevel',
    ],
    labels: [
      'degree', 'education', 'highest degree', 'qualification', 'education level',
      'highest education', 'degree type', 'academic degree',
    ],
    placeholders: ['degree', 'highest degree', 'select degree'],
  },
  school: {
    names: [
      'school', 'university', 'institution', 'college', 'alma_mater', 'school_name',
      'university_name', 'college_name', 'educational_institution', 'schoolName',
    ],
    labels: ['school', 'university', 'institution', 'college', 'school name', 'university name'],
    placeholders: ['school', 'university name', 'institution', 'college name'],
  },
  major: {
    names: [
      'major', 'field_of_study', 'concentration', 'specialization', 'course_of_study',
      'study_field', 'fieldOfStudy', 'academic_major',
    ],
    labels: [
      'major', 'field of study', 'concentration', 'specialization',
      'course of study', 'area of study',
    ],
    placeholders: ['major', 'field of study', 'concentration'],
  },
  graduationDate: {
    names: [
      'graduation_date', 'graduation_year', 'grad_date', 'grad_year',
      'expected_graduation', 'graduationDate', 'completion_date',
    ],
    labels: [
      'graduation date', 'graduation year', 'grad date', 'expected graduation',
      'year of graduation', 'completion date',
    ],
    placeholders: ['graduation date', 'graduation year', 'mm/yyyy'],
  },
  visaStatus: {
    names: [
      'visa', 'visa_status', 'work_authorization', 'authorization', 'work_permit',
      'immigration_status', 'work_auth', 'visaStatus', 'workAuthorization',
    ],
    labels: [
      'visa', 'work authorization', 'authorized to work', 'visa status',
      'immigration status', 'work permit', 'employment authorization',
    ],
    placeholders: ['visa status', 'work authorization', 'select visa status'],
  },
  authorizedToWork: {
    names: [
      'authorized_to_work', 'work_authorized', 'legally_authorized', 'is_authorized',
      'authorizedToWork', 'legally_eligible',
    ],
    labels: [
      'authorized to work', 'legally authorized to work', 'are you authorized',
      'eligible to work', 'work eligibility',
    ],
    placeholders: [],
  },
  requiresSponsorship: {
    names: [
      'require_sponsorship', 'requires_sponsorship', 'need_sponsorship', 'visa_sponsorship',
      'sponsorship_required', 'requiresSponsorship',
    ],
    labels: [
      'require sponsorship', 'will you require sponsorship', 'need visa sponsorship',
      'sponsorship required', 'do you need sponsorship',
    ],
    placeholders: [],
  },
  salaryMin: {
    names: ['salary_min', 'min_salary', 'salary_minimum', 'minimum_salary', 'minSalary'],
    labels: ['minimum salary', 'salary minimum', 'min salary', 'minimum compensation'],
    placeholders: ['minimum salary', 'min salary'],
  },
  salaryMax: {
    names: ['salary_max', 'max_salary', 'salary_maximum', 'maximum_salary', 'maxSalary'],
    labels: ['maximum salary', 'salary maximum', 'max salary', 'maximum compensation'],
    placeholders: ['maximum salary', 'max salary'],
  },
  salaryExpectation: {
    names: [
      'salary', 'salary_expectation', 'expected_salary', 'desired_salary',
      'compensation', 'salary_requirement', 'salaryExpectation', 'pay_expectation',
    ],
    labels: [
      'salary', 'expected salary', 'desired salary', 'salary expectation',
      'compensation expectation', 'salary requirement', 'what salary are you expecting',
    ],
    placeholders: ['salary', 'expected salary', 'desired salary', 'compensation'],
  },
  availability: {
    names: [
      'availability', 'start_date', 'available_date', 'available_from', 'notice_period',
      'earliest_start', 'noticePeriod', 'startDate',
    ],
    labels: [
      'availability', 'start date', 'available from', 'notice period', 'earliest start date',
      'when can you start', 'available to start',
    ],
    placeholders: ['availability', 'start date', 'notice period', 'when can you start'],
  },
  openToRemote: {
    names: ['remote', 'open_to_remote', 'remote_work', 'work_remote', 'openToRemote', 'willing_to_work_remote'],
    labels: ['remote', 'open to remote', 'remote work', 'willing to work remotely'],
    placeholders: [],
  },
  openToRelocate: {
    names: ['relocate', 'open_to_relocate', 'willing_to_relocate', 'relocation', 'openToRelocate'],
    labels: ['relocate', 'open to relocation', 'willing to relocate', 'relocation'],
    placeholders: [],
  },
  gender: {
    names: ['gender', 'sex', 'gender_identity', 'applicant_gender'],
    labels: ['gender', 'sex', 'gender identity', 'gender expression'],
    placeholders: ['select gender'],
  },
  ethnicity: {
    names: ['ethnicity', 'race', 'ethnic_origin', 'racial_background', 'ethnicOrigin'],
    labels: ['ethnicity', 'race', 'ethnic origin', 'racial background', 'race/ethnicity'],
    placeholders: ['select ethnicity', 'select race'],
  },
  veteranStatus: {
    names: ['veteran', 'veteran_status', 'military', 'military_status', 'veteranStatus'],
    labels: ['veteran status', 'military service', 'are you a veteran', 'veteran'],
    placeholders: ['select veteran status'],
  },
  disabilityStatus: {
    names: ['disability', 'disability_status', 'disabled', 'disabilityStatus', 'accommodation'],
    labels: ['disability', 'disability status', 'do you have a disability', 'accommodation'],
    placeholders: ['select disability status'],
  },
};

// ── ATS Detection ─────────────────────────────────────────────────────────────

export type AtsType =
  | 'workday' | 'greenhouse' | 'lever' | 'icims' | 'smartrecruiters'
  | 'taleo' | 'ashby' | 'workable' | 'bamboohr' | 'jobvite' | 'jazz'
  | 'successfactors' | 'oracle' | 'linkedin' | 'indeed' | 'generic';

export function detectAts(): AtsType {
  const host = window.location.hostname.toLowerCase();
  const href = window.location.href.toLowerCase();
  const body = document.body?.innerHTML?.slice(0, 5000) || '';

  if (
    host.includes('myworkdayjobs.com') ||
    host.includes('workday.com') ||
    document.querySelector('[data-automation-id]')
  ) return 'workday';

  if (
    host.includes('greenhouse.io') ||
    document.querySelector('#application_form, #board_company_name, [id^=\"grnhse\"]')
  ) return 'greenhouse';

  if (
    host.includes('lever.co') ||
    document.querySelector('[name^=\"lever-\"], .lever-apply, [data-qa=\"lever-\"]')
  ) return 'lever';

  if (host.includes('icims.com') || href.includes('icims')) return 'icims';

  if (
    host.includes('smartrecruiters.com') ||
    document.querySelector('.smart-apply, [data-smarttoken]')
  ) return 'smartrecruiters';

  if (host.includes('taleo.net') || href.includes('taleo')) return 'taleo';

  if (
    host.includes('ashbyhq.com') ||
    host.includes('ashby.io') ||
    document.querySelector('[data-ashby-job-posting-id], ._ashby_')
  ) return 'ashby';

  if (
    host.includes('workable.com') ||
    document.querySelector('[data-ui=\"application-form\"], .whr-item')
  ) return 'workable';

  if (host.includes('bamboohr.com')) return 'bamboohr';

  if (host.includes('jobvite.com')) return 'jobvite';

  if (host.includes('jazzhr.com') || href.includes('jazz.co')) return 'jazz';

  if (host.includes('successfactors.com') || host.includes('sapsf.com')) return 'successfactors';

  if (host.includes('oracle.com') || href.includes('oraclecloud.com')) return 'oracle';

  if (host.includes('linkedin.com') && href.includes('apply')) return 'linkedin';

  if (host.includes('indeed.com') && href.includes('apply')) return 'indeed';

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  void body; // reserved for future heuristics

  return 'generic';
}

